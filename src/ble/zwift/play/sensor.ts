import { LegacyProfile } from "../../../antv2/types";
import { ClickKeyPadStatus, DeviceDataEnvelope, DeviceInformationContent, DeviceSettings, HubCommand, HubRequest, HubRidingData, Idle, PlayButtonStatus, SimulationParam } from "../../../proto/zwift_hub";
import { TBleSensor } from "../../base/sensor";
import { BleProtocol, IBlePeripheral  } from "../../types";
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
    protected isFM: boolean
    protected tsLastRidingData: number
    protected isHubServiceActive: boolean
    protected isPaired: boolean
    protected isSubscribed: boolean

    constructor (peripheral:IBlePeripheral|TBleSensor , props?) {
        
        if ( peripheral && 
            'startSensor' in peripheral && typeof peripheral.startSensor === 'function'  && 
            'getPeripheral' in peripheral && typeof peripheral.getPeripheral === 'function'
        ) {
            super(peripheral.getPeripheral(),props) 
            // peripheral is IBleSensor
            this.isFM = true
        }
        else {
            super(peripheral as IBlePeripheral,props)
            this.isFM = false
        }
        
        

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

        console.log('# data', uuid, data?.toString('hex'))            

        if (uuid === '00000002-19ca-4651-86e5-fa29dcdd09d1') { 
            this.onMeasurement(data)
        }
        else if (uuid === '00000004-19ca-4651-86e5-fa29dcdd09d1') {
            this.onResponse(data)
        }
        else {
            //console.log('# data', uuid, data?.toString('hex'),isNotify? 'N': 'I')            
        }

        return true
    }

    async requestDataUpdate( dataId:number) {
        await this.sendHubRequest({dataId})
    }

    async setSimulationData( data?:SimulationParam) {
        if (!this.isHubServiceActive) {
            await this.initHubService(false)
        }

        const crrx100000 = Math.round(data?.crrx100000??5100)
        const cWax10000 = Math.round(data?.cWax10000??400)
        const windx100 = Math.round(data?.windx100??0)
        const inclineX100 = Math.round(data?.inclineX100??0)

        const simulation:SimulationParam = { inclineX100, crrx100000, cWax10000,windx100}
        await this.sendHubCommand( {simulation})
        await this.requestDataUpdate(512)
    }

    async setGearRatio( gearRatio:number):Promise<number> {

        try {
            console.log('# set gear ratio', gearRatio )
            if (!this.isHubServiceActive) {
                await this.initHubService()
            }
            
            const gearRatioX10000 = Math.round(gearRatio*10000)
            const bikeWeightx100 = 10*100        
            const riderWeightx100 = 75*100
            const command:HubCommand = { 
                physical: {bikeWeightx100,gearRatioX10000,riderWeightx100}
            }

            await this.sendHubCommand( command)
            await this.requestDataUpdate(512)
        }
        catch(err) {
            console.log('# set gear ratio failed',err)
        }

        return gearRatio

    }

    protected async sendPlayCommand( id:number, command: Buffer) {
        const data = Buffer.concat([Buffer.from([id]), command]);

        return await this.write('00000003-19ca-4651-86e5-fa29dcdd09d1',data,{withoutResponse:true})
    }

    protected onMeasurement(d: Buffer): boolean {
        const data = Buffer.from(d)

        if (data?.length<1) {
            console.log('Invalid click measurement data', data.toString('hex'))
            return false
        }
        const type = data.readUInt8(0)
        const message = data.subarray(1)

        if (type===0x37) {
            this.onClickButtonMessage(message)
        }
        else if (type===0x19) {
            this.onPingMessage(message)
        }
        else if (type===0x42) { 
            console.log('# init confirmed')
        }
        else if (type===0x03) {
            this.onRidingData(message)
        }
        else if (type===0x3c) {
            this.onDeviceInformation(message)
        }

        else {
            console.log('Unknown click measurement type', type, message.toString('hex'))
            this.emit('data', { raw: data.toString('hex')})

        }

        return true
    }

    async initHubService( setSimulation:boolean = true):Promise<boolean> {
        console.log('# init Hub Service')

        if (this.isHubServiceActive)
            return true;

        if (!this.isPaired) {
            await this.pair()
        }

        if (!this.isSubscribed) {
            await this.subscribe()
            this.isSubscribed = true
        }


        return new Promise<boolean> ( (done)=>{

            let timeout = setTimeout( ()=>{
                done(false)
            }, 2000)

            this.once('hub-riding-data', ()=>{
                if (timeout) {
                    clearTimeout(timeout)
                    timeout = undefined
                }
                this.isHubServiceActive = true

                console.log('# init hub service completed')
                if (setSimulation) {
                    this.setSimulationData().then( ()=>{
                        done(true)
                    })
                    .catch( () => {
                        done(true)
                    })
                }
                else {
                    done(true)
                }                
            })
            
            this.sendPlayCommand( 0x41, Buffer.from([0x08, 0x05]))
            .catch(err =>{
                if (timeout) {
                    clearTimeout(timeout)
                    timeout = undefined
                }
                console.log('# init hub service timeout')
                done(false)
                this.logEvent({message:'could not init hub service', reason: err.message})
            })
        })

    }

    async sendHubRequest( request:HubRequest) {
        const message =  Buffer.from(HubRequest.toBinary(request))      
        console.log('# sending hub request', request, message )
        this.logEvent({mesage:'send zwift hub request',request})
        return await this.sendPlayCommand( 0x00, message)
    }

    async sendHubCommand( command:HubCommand) {
        const message =  Buffer.from(HubCommand.toBinary(command))      


        console.log('# sending hub command', command, message, )
        this.logEvent({mesage:'send zwift hub command',command})

        return await this.sendPlayCommand( 0x04, message)

    }

    protected onRidingData(m:Buffer) {
        try {

            this.tsLastRidingData = Date.now()
            const data = HubRidingData.fromBinary( m)
            this.emit('hub-riding-data', data)
            console.log('#riding data',data)
            this.logEvent({ message:'riding data received',   power:data.power,  cadence:data.cadence, Speed:data.speedX100/100, heartrate:data.hR,  unknown1: data.unknown1, unknown2:data.unknown2})
        }
        catch(err) {
            this.logEvent( {message:'Error', fn:'onRidingData', error:err.message, stack:err.stack})
        }
    }

    protected onDeviceInformation(m:Buffer) {

        try {
            const envelope: DeviceDataEnvelope = DeviceDataEnvelope.fromBinary(m)
            const {messageType,payload} = envelope
            if (messageType<16) {
                const deviceInfo = DeviceInformationContent.fromBinary(payload)
                console.log('# deviceInfo',deviceInfo)
                this.emit('hub-device-info', deviceInfo)
                this.logEvent({message:'hub device info update', deviceInfo})
            }
            else if (messageType>=512 && messageType<526) {
                const si = DeviceSettings.fromBinary(payload)

                console.log('# settings',si?.subContent)                
                this.emit('hub-settings', si?.subContent)
                this.logEvent({message:'hub settings update', settings:si?.subContent})
            }

        // PB
        }
        catch(err) {
            let payload = 'unknown'
            try { payload = m.toString('hex')} catch {}

            this.logEvent( {message:'Error', fn:'onRidingData', error:err.message, stack:err.stack, payload})
        }
    }

    onClickButtonMessage(d:Buffer) {
        try {
            const message = Buffer.from(d)
            const messageStr = message.toString('hex')

            if (messageStr===this.prevClickMessage) { 
                return
            }

            const status:ClickKeyPadStatus = ClickKeyPadStatus.fromBinary(message)
            if (status.buttonPlus===PlayButtonStatus.OFF) {
                const prev = {...this.upState}
                this.upState = { pressed: false, timestamp: Date.now() }
                if (prev.pressed) {
                    this.emit( 'key-pressed',{key: 'up', duration:this.upState.timestamp-prev.timestamp, deviceType:this.deviceType})
                }
            }
            else {
                this.upState = { pressed: true, timestamp: Date.now() }                            

            }

            if (status.buttonMinus===PlayButtonStatus.OFF) {
                const prev = {...this.downState}
                this.downState = { pressed: false, timestamp: Date.now() }
                if (prev.pressed) {
                    this.emit( 'key-pressed',{key: 'down', duration:this.downState.timestamp-prev.timestamp, deviceType:this.deviceType})
                }

            }
            else {
                this.downState = { pressed: true, timestamp: Date.now() }                            
            }

            this.prevClickMessage = messageStr
        }
        catch(err) {
            this.logEvent({message:'error', fn:'onButtonMessage', error:err.message, stack:err.stack})
        }
    }

    onPingMessage(message:Buffer) {
        const idle:Idle = Idle.fromBinary(message)

        console.log('# ping message',idle)
        this.emit('data', { deviceType:this.deviceType, paired: this.paired, alive:true, ts:Date.now() })
    }

    onResponse(d: Buffer): boolean {
        const data = Buffer.from(d)

        if (data?.length<1) {
            console.log('Invalid response data', data.toString('hex'))
            return false
        }
        const type = data.readUInt8(0)
        const message = data.subarray(1)

        if (type===0x3c) {
            this.onDeviceInformation(message)
        }
        else {
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

        if (this.isPaired)
            return true

        let manufacturerData:string
        try {
            if (this.peripheral.getManufacturerData) {
                manufacturerData = this.getManufacturerData()

                if (manufacturerData?.startsWith('4a09')) {
                    const typeVal = Number('0x'+manufacturerData.substring(2,4))
                    
                    if (typeVal===9) {
                        this.deviceType = 'click'
                        this.encrypted = false
                    }
                    else if (typeVal===2) { 
                        this.deviceType = 'right'
                    }
                    else if (typeVal===3) { 
                        this.deviceType = 'left'
                    }
                }
                
            }

            if ( !this.encryptedSupported()) {
                this.deviceType = 'click'                
                this.encrypted = false
            }

            this.logEvent({message:'Play protocol pairing info', deviceType:this.deviceType, encrypted:this.encrypted, manufacturerData})

            let message;
            if (!this.encrypted) {
                message = this.isFM ? Buffer.concat( [ Buffer.from('RideOn'), Buffer.from( [0x02, 0x01]) ] ) :Buffer.from('RideOn') 
               
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

            this.isPaired = true
            return true
        } catch (err) {

            this.logEvent({message:'error', fn:'pair', error:err.message, stack:err.stack})
            this.isPaired = false
            return false
        }
    }

    reset(): void {
        // 
    }


    protected encryptedSupported():boolean {
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
