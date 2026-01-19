import { EventLogger } from "gd-eventlog";
import { LegacyProfile } from "../../../antv2/types";
import { ClickKeyPadStatus, DeviceDataEnvelope, DeviceInformationContent, DeviceSettings, DeviceSettingsSubContent, HubCommand, HubRequest, HubRidingData, Idle, PhysicalParam, PlayButtonStatus, SimulationParam, TrainerResponse } from "../../../proto/zwift_hub";
import { TBleSensor } from "../../base/sensor";
import { BleProtocol, IBlePeripheral  } from "../../types";
import { beautifyUUID, fullUUID  } from "../../utils";
import { generateKeyPairSync } from 'crypto';
import { EventEmitter } from "events";

type ButtonState = {
    pressed: boolean
    timestamp: number
}

type BleZwiftPlaySensorProps = 
{ 
    logger?:EventLogger
    isTrainer?:boolean

}    


type DeviceType = 'left' | 'right' | 'click' | 'hub'

export class BleZwiftPlaySensor extends TBleSensor {
    static readonly profile:LegacyProfile  = 'Controller'   
    static readonly protocol:BleProtocol = 'zwift-play'
    static readonly services =  ['0000000119ca465186e5fa29dcdd09d1'];
    static readonly characteristics =  [];
    static readonly detectionPriority = 1;

    protected emitter: EventEmitter
    protected isHubPairConfirmed: boolean
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
    protected isHubServicePaired: boolean
    protected isHubServiceSubscribed: boolean

    protected initHubServicePromise: Promise<boolean>
    protected pairPromise: Promise<boolean>
    protected subscribePromise: Promise<boolean>
    protected prevHubSettings: DeviceSettingsSubContent|undefined
    protected prevcWax10000: number

    constructor (peripheral:IBlePeripheral|TBleSensor , props?:BleZwiftPlaySensorProps) {
        
        if ( props?.isTrainer && peripheral) {
            const sensor = peripheral as TBleSensor
            super(sensor.getPeripheral(),props) 
            this.isFM = true
        }

        else if ( peripheral && 
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
        try {

            if (!this.isHubServiceActive) {
                await this.initHubService(false)
            }

            if (!this.isHubServiceActive || !this.isHubPairConfirmed)
                return

            const crrx100000 = Math.round(data?.crrx100000??400)
            const cWax10000 = Math.round(data?.cWax10000??5100)
            const windx100 = Math.round(data?.windx100??0)
            
            let inclineX100 = Math.round(data?.inclineX100??1)
            if (inclineX100===0 || Number.isNaN(inclineX100)) inclineX100 = 1
            

            // only send things that have changed
            const simulation:SimulationParam = {}
            if (inclineX100 !== this.prevHubSettings?.inclineX100) {
                simulation.inclineX100 = inclineX100
            }
            if ( crrx100000 !== this.prevHubSettings?.crrx100000) 
                simulation.crrx100000 = crrx100000
            if ( cWax10000 !== this.prevcWax10000) {
                simulation.cWax10000 = cWax10000
                this.prevcWax10000 = cWax10000
            }
            if ( windx100!== this.prevHubSettings?.windx100) {
                simulation.windx100 = windx100
            }

            await this.sendHubCommand( {simulation})
            await this.requestDataUpdate(512)
        }
        catch(err) {
            this.logger.logEvent( {message:"error",fn:'setSimulationData',data, error:err.message,stack:err.stack} );                        
        }

    }

    async setIncline( incline:number) {
        const inclineX100 = Math.round(incline *100);
        await this.setSimulationData({inclineX100})
    }

    async setGearRatio( gearRatio:number):Promise<number> {

        try {
            if (!this.isHubServiceActive) {
                await this.initHubService()
            }
            if (!this.isHubServiceActive|| !this.isHubPairConfirmed)
                return
            
            const gearRatioX10000 = Math.round(gearRatio*10000)
            const bikeWeightx100 = 10*100        
            const riderWeightx100 = 75*100

            // only send was has changed
            const physical:PhysicalParam = {}
            if (bikeWeightx100!==this.prevHubSettings?.bikeWeightx100)
                physical.bikeWeightx100 = bikeWeightx100
            if (riderWeightx100!==this.prevHubSettings?.riderWeightx100)
                physical.riderWeightx100 = riderWeightx100
            if (gearRatioX10000!==this.prevHubSettings?.gearRatiox10000) {
                physical.gearRatioX10000 = gearRatioX10000
            }

            if (Object.keys(physical).length===0) {
                // no update
                return
            }

            await this.sendHubCommand( {physical})
            await this.requestDataUpdate(512)
        }
        catch(err) {
            this.logger.logEvent( {message:"error",fn:'setGearRatio',gearRatio, error:err.message,stack:err.stack} );                        

        }

        return gearRatio

    }

    protected async sendPlayCommand( id:number, command: Buffer) {
        const data = Buffer.concat([Buffer.from([id]), command]);

        return await this.write('00000003-19ca-4651-86e5-fa29dcdd09d1',data,{withoutResponse:true})
    }

    protected onMeasurement(d: Buffer): boolean {
        const data = Buffer.from(d)

        this.logEvent({message:'got hub notification', raw:data.toString('hex')})

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
        else if (type===0x2A) {  
            this.onTrainerResponse(message)
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
        
        if (!this.isHubServiceActive && this.initHubServicePromise!==undefined) {
            await this.initHubServicePromise            
        }


        const subscribe = async () => {
            if (!this.isHubServiceSubscribed) {
                this.logEvent({message:'subscribe to hub service characteristics'})

                this.subscribePromise  = this.subscribePromise ?? this.subscribe()
                const subscribed = await this.subscribePromise
                this.subscribePromise = undefined

                this.isHubServiceSubscribed = subscribed
                if (!subscribed)
                    return false

                this.logEvent({message:'subscribed to hub service characteristics'})

            }

        }

        const pair = async ()=> {
            if (!this.isHubServicePaired) {

                this.logEvent({message:'pair hub service'})

                this.pairPromise  = this.pair()
                const paired = await this.pairPromise
                this.pairPromise = undefined

                if (!paired)
                    return false
                
            }

        }
        



        if (this.isHubServiceActive)
            return true;

        this.logEvent({message:'init hub service', paired:this.isHubPairConfirmed,subscribed:this.isHubServiceSubscribed })


        await subscribe()
        await pair()
        await subscribe() // if subscribe was not successfull before pairing, try again after pairing


        this.initHubServicePromise  = new Promise<boolean> ( (done)=>{

            this.logEvent({message:'send hub init message'})

            let timeout = setTimeout( ()=>{
                this.logEvent({message:'could not init hub service', reason: 'timeout'})
                done(false)
            }, 2000)

            this.once('hub-riding-data', ()=>{
                if (timeout) {
                    clearTimeout(timeout)
                    timeout = undefined
                }
                this.isHubServiceActive = true

                this.logEvent({message:'init hub service done', paired: this.isHubServicePaired,confirmed:this.isHubPairConfirmed,subscribed:this.isHubServiceSubscribed })


                if (setSimulation) {
                    this.logEvent({message:'hub: send initial simulation data'})
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
                done(false)
                this.logEvent({message:'could not init hub service', reason: err.message})
            })
        })

        return this.initHubServicePromise

    }

    async sendHubRequest( request:HubRequest) {
        const message =  Buffer.from(HubRequest.toBinary(request))      
        this.logEvent({mesage:'send zwift hub request',request})
        return await this.sendPlayCommand( 0x00, message)
    }

    async sendHubCommand( command:HubCommand) {
        const message =  Buffer.from(HubCommand.toBinary(command))      
        this.logEvent({mesage:'send zwift hub command',command})
        return await this.sendPlayCommand( 0x04, message)

    }

    protected onTrainerResponse(m:Buffer) {
        try {

            const data = TrainerResponse.fromBinary( m)
            this.emit('hub-trainer-response', data)
            
            this.logEvent({ message:'trainer response received',   data})
        }               
        catch(err) {
            this.logEvent( {message:'Error', fn:'onTrainerResponse', error:err.message, stack:err.stack})
        }
    }

    protected onRidingData(m:Buffer) {
        try {

            this.tsLastRidingData = Date.now()
            const data = HubRidingData.fromBinary( m)
            this.emit('hub-riding-data', data)
            
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
                this.emit('hub-device-info', deviceInfo)
                this.logEvent({message:'hub device info update', deviceInfo})
            }
            else if (messageType>=512 && messageType<526) {
                const si = DeviceSettings.fromBinary(payload)

                this.emit('hub-settings', si?.subContent)
                this.logEvent({message:'hub settings update', settings:si?.subContent})
                this.prevHubSettings = si?.subContent
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

        this.emit('data', { deviceType:this.deviceType, paired: this.isHubPairConfirmed, alive:true, ts:Date.now() })
    }

    onResponse(d: Buffer): boolean {

        const data = Buffer.from(d)
        this.logEvent({message:'got hub message',raw:data.toString('hex'),str:data.toString() })

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



            if (len==6 && data.toString()==='RideOn') {
                this.encrypted = false
                this.isHubPairConfirmed = true
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
                    this.isHubPairConfirmed = true
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
            else if (Buffer.from(data.subarray(0, 6)).toString() === 'RideOn'){
                this.encrypted = false
                this.isHubPairConfirmed = true
                this.emitter.emit('paired')
                try {
                    this.emit('data', { deviceType:this.deviceType, paired:true, ts:Date.now() })
                } catch (err) {
                    
                    this.logEvent({message:'error', fn:'onPairResponse', error:err.message, stack:err.stack})
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

        if (this.isHubServicePaired)
            return true

        if (this.pairPromise!==undefined) {
            const paired = await this.pairPromise
            this.pairPromise = undefined
            if (paired)
                return
        }

        let manufacturerData:string
        try {

            if (this.isFM) {
                this.deviceType = 'hub'
                this.encrypted = false
            }
            else if (this.peripheral.getManufacturerData) {
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
            

            if ( !this.deviceType && !this.encryptedSupported()) {
                this.deviceType = 'click'
                this.encrypted = false
            }

            // fallback to 'click if we could not identify a device yet
            this.deviceType = this.deviceType ?? 'click'
            

            this.logEvent({message:'Play protocol pairing info', deviceType:this.deviceType, encrypted:this.encrypted, manufacturerData})

            let message;

            if (this.isFM) {
                message = Buffer.concat( [ Buffer.from('RideOn'), Buffer.from( [0x02, 0x01]) ] ) 
            }
            else if (this.encrypted) {
                const { publicKey, privateKey } = this.createKeyPair()

                this.privateKey = this.privateKey ?? Buffer.from(privateKey)
                this.publicKey = this.publicKey ?? Buffer.from(publicKey)

                message = Buffer.concat( [ Buffer.from('RideOn'), Buffer.from( [0x02, 0x03]), this.publicKey ] )
               
            }
            else {
                message = Buffer.from('RideOn') 
            }

            this.logEvent({message:`send rideOn` })
            await this.write( fullUUID('00000003-19ca-4651-86e5-fa29dcdd09d1'), 
                         message, 
                         {withoutResponse:true} )
            this.isHubServicePaired = true

            this.logEvent({message: 'pairing done', deviceType:this.deviceType, encrypted:this.encrypted, manufacturerData})
            return true
        } catch (err) {

            this.logEvent({message:'error', fn:'pair', error:err.message, stack:err.stack})
            this.isHubServicePaired = false
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
        this.isHubPairConfirmed = false
        this.encrypted = false
        this.deviceKey = null

        this.isHubServicePaired = false
        this.isHubServiceSubscribed = false
        this.isHubServiceActive = false
        delete this.initHubServicePromise
        delete this.prevHubSettings

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
