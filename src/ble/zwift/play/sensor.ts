import { LegacyProfile } from "../../../antv2/types";
import { TBleSensor } from "../../base/sensor";
import { BleProtocol } from "../../types";
import { beautifyUUID, fullUUID  } from "../../utils";
import { generateKeyPairSync } from 'crypto';
import { EventEmitter } from "events";

type ButtonState = {
    pressed: boolean
    timestamp: number
}

type DeviceType = 'left' | 'right' | 'click'

export class BleZwiftPlaySensor extends TBleSensor {
    static readonly profile:LegacyProfile  = 'Controller'   
    static readonly protocol:BleProtocol = 'zwift-play'
    static readonly services =  ['0000000119ca465186e5fa29dcdd09d1'];
    static readonly characteristics =  [];
    static readonly detectionPriority = 1;

    protected emitter: EventEmitter
    protected paired: boolean
    protected encrypted: boolean
    protected deviceKey: Buffer
    protected prevClickMessage: string
    protected upState:  ButtonState
    protected downState: ButtonState
    protected deviceType: DeviceType
    protected publicKey: Buffer
    protected privateKey: Buffer

    constructor (peripheral, props?) {
        super(peripheral,props)
        

        this.emitter = new EventEmitter()
        this.setInitialState()
    }

    async reconnectSensor() {     
        this.setInitialState()
        let reconnected = await super.reconnectSensor()
        this.pair()
        return reconnected
    }

    stopSensor(): Promise<boolean> {
        this.emitter.removeAllListeners()
        this.setInitialState()

        this.removeAllListeners('key-pressed')        
        return super.stopSensor()
    }

    protected getRequiredCharacteristics():Array<string> {
        return ['00000002-19ca-4651-86e5-fa29dcdd09d1','00000004-19ca-4651-86e5-fa29dcdd09d1']
    }

    onData(characteristic: string, data: Buffer, isNotify?: boolean): boolean {


        const uuid = beautifyUUID(characteristic).toLowerCase()
        if (uuid === '00000002-19ca-4651-86e5-fa29dcdd09d1') { 
            this.onPlayMeasurement(data)
        }
        else if (uuid === '00000004-19ca-4651-86e5-fa29dcdd09d1') {
            this.onPairResponse(data)
        }
        else {
            console.log('data received ', isNotify? 'N': 'I', uuid, data.toString('hex'))

        }

        return true
    }

    onPlayMeasurement(d: Buffer): boolean {
        const data = Buffer.from(d)

        if (data?.length<1) {
            console.log('Invalid click measurement data', data.toString('hex'))
            return false
        }
        const type = data.readUInt8(0)
        const message = data.subarray(1)

        if (type===0x37) {
            this.onButtonMessage(message)
        }
        else if (type===0x19) {
            this.onPingMessage(message)
        }
        else {
            console.log('Unknown click measurement type', type, message.toString('hex'))
            this.emit('data', { raw: data.toString('hex')})

        }

        return true
    }

    onButtonMessage(d:Buffer) {
        const message = Buffer.from(d)

        // TODO: replace with protobuf implementation

        try {
            if (message.readUInt8(0)===0x8 && message.length===4) { 
                const value = Buffer.from(message.subarray(1))
                const messageStr = value.toString('hex')

                if (messageStr===this.prevClickMessage) { 
                    return
                }
                switch (messageStr) {
                    case '001001':
                        this.upState = { pressed: true, timestamp: Date.now() }
                        break
                    // 0 000 1000 0000 0001 
                    // 0 001 0000 0000 0001
                    case '011001':
                        if ( this.upState?.pressed) {
                            const prev = {...this.upState}
                            this.upState = { pressed: false, timestamp: Date.now() }
                            this.emit( 'key-pressed',{key: 'up', duration:this.upState.timestamp-prev.timestamp, deviceType:this.deviceType})
                        }
                        else if ( this.downState?.pressed) {
                            const prev = {...this.downState}
                            this.downState = { pressed: false, timestamp: Date.now() }
                            this.emit( 'key-pressed',{key: 'down', duration:this.downState.timestamp-prev.timestamp, deviceType:this.deviceType})
                        }
                        else {
                            this.upState = { pressed: false, timestamp: Date.now() }                            
                            this.downState = { pressed: false, timestamp: Date.now() }                            
                        }
                        
                        break
                    case '011000':
                        this.downState = { pressed: true, timestamp: Date.now() }
                        break
                }
                this.prevClickMessage = messageStr
            }
            else {
                this.logEvent( {message:'Click measurement received', raw:message.toString('hex')})
            }
        }
        catch(err) {
            this.logEvent({message:'error', fn:'onButtonMessage', error:err.message, stack:err.stack})
        }
    }

    onPingMessage(d:Buffer) {
        this.emit('data', { deviceType:this.deviceType, paired: this.paired, alive:true, ts:Date.now() })
    }

    onPairResponse(d: Buffer): boolean {
        const data = Buffer.from(d)

        const len = data.length
        if (len === 6 && data.toString()==='RideOn') {
            this.encrypted = false
            this.paired = true
            this.emitter.emit('paired')
            try {
                this.emit('data', { deviceType:this.deviceType, paired:true, ts:Date.now() })
            } catch (err) {
                
                this.logEvent({message:'error', fn:'onPairResponse', error:err.message, stack:err.stack})
            }

        }
        

        else if (len > 8 && Buffer.from(data.subarray(0, 6)).toString() === 'RideOn') {
            const message = Buffer.from(data.subarray(6,2)).toString('hex')
            if (message==='0900') {
                this.encrypted = true
                this.paired = true
                this.deviceKey = data.subarray(8)
                this.emitter.emit('paired')
                try {
                    this.emit('data', { deviceType:this.deviceType, paired:true, ts:Date.now() })
                } catch (err) {
                    this.logEvent({message:'error', fn:'onPairResponse', error:err.message, stack:err.stack})
                }
            }
            else {
                this.logEvent({message: 'Pairing failed! ', reason:'unknown message', raw:message})
            }
            
        }

        return true
    }

    async read(characteristic: string, ignoreErrors: boolean=false): Promise<Buffer | null> {
        try {
            return await super.read(characteristic)
        } catch (error) {
            if (!ignoreErrors)
                throw error
            return null
        }
    }

    async pair() : Promise<boolean> {

        try {
            if (this.peripheral.getManufacturerData) {
                const manufacturerData = this.getManufacturerData()

                if (manufacturerData?.startsWith('4a09')) {
                    const typeVal = Number('0x'+manufacturerData.substring(2,4))
                    if (typeVal===9) {
                        this.deviceType = 'click'
                    }
                    else if (typeVal===2) { 
                        this.deviceType = 'right'
                    }
                    else if (typeVal===3) { 
                        this.deviceType = 'left'
                    }
                }
                
            }
            else if ( !this.encrpytedSupported()) {
                this.deviceType = 'click'                
            }

            let message;

            if (this.deviceType==='click') {
                message = Buffer.from('RideOn')
                this.encrypted = false
            }
            else {
                const { publicKey, privateKey } = this.createKeyPair()

                this.privateKey = this.privateKey ?? Buffer.from(privateKey)
                this.publicKey = this.publicKey ?? Buffer.from(publicKey)

                message = Buffer.concat( [ Buffer.from('RideOn'), Buffer.from( [0x01, 0x02]), this.publicKey ] )
            
            }

            await this.write( fullUUID('00000003-19ca-4651-86e5-fa29dcdd09d1'), 
                         message, 
                         {withoutResponse:true} )

            return true
        } catch (err) {
            this.logEvent({message:'error', fn:'pair', error:err.message, stack:err.stack})
            return false
        }
    }

    reset(): void {
        // 
    }


    protected encrpytedSupported():boolean {
        // TODO implement with crypto feature

        return generateKeyPairSync!==undefined && typeof (generateKeyPairSync)==='function'

    }

    protected createKeyPair() {
        // TODO implement with crypto feature

        return generateKeyPairSync('ec', {
                            namedCurve: 'prime256v1',
                            publicKeyEncoding: { type: 'spki', format: 'der' },
                            privateKeyEncoding: { type: 'pkcs8', format: 'der' }
                        });
    }




    protected setInitialState() {
        this.paired = false
        this.encrypted = false
        this.deviceKey = null
    }

    protected getManufacturerData() : string {
        const data = this.peripheral.getManufacturerData()

        if (typeof data === 'string')
            return data

        if (Buffer.isBuffer(data)){
            return data.toString('hex')
        }
        return undefined
    }

}
