import { BleCharacteristic, BleDeviceIdentifier, BleService, BleWriteProps, IBlePeripheral, } from "../../ble/types";
import { DirectConnectBinding, MulticastDnsAnnouncement, Socket } from "../bindings";
import { InteruptableTask, TaskState } from "../../utils/task";
import DirectConnectInterface from "./interface";
import { CharacteristicNotificationMessage, DiscoverCharacteristicsMessage, DiscoverServiceMessage, EnableCharacteristicNotificationsMessage, parseHeader, RC, ReadCharacteristicMessage, WriteCharacteristicMessage } from "../messages";
import EventEmitter from "events";
import { DC_MESSAGE_CHARACTERISTIC_NOTIFICATION, DC_RC_REQUEST_COMPLETED_SUCCESSFULLY } from "../consts";
import {  beautifyUUID, parseUUID } from "../../ble/utils";

export class DirectConnectPeripheral implements IBlePeripheral {

    static readonly instances: Record<string, DirectConnectPeripheral> ={}
    
    static create(announcement:MulticastDnsAnnouncement) {
        const {address,port}  = announcement
        const key = `${address}:${port}`
        if (!this.instances[key])
            this.instances[key] = new DirectConnectPeripheral(announcement)
        return this.instances[key]
    }


    protected socket:Socket
    protected connectTask: InteruptableTask<TaskState,boolean>
    protected msgSeqNo = 0;
    protected onDataHandler = this.onData.bind(this)
    protected onPortErrorHandler = this.onPortError.bind(this)
    protected onPortCloseHandler = this.onPortClose.bind(this)
    protected partialBuffer = null
    protected remainingBuffer = null
    protected eventEmitter = new EventEmitter()
    protected subscribed: Array<string> = [] 
    protected onDisconnectHandler: ()=>void;
    protected discoveredServiceUUIds: Array<string>

    constructor( protected announcement:MulticastDnsAnnouncement) { 
        
    }

    getInfo(): BleDeviceIdentifier {
        return {
            id: this.announcement?.address?.replace(/:/g,''),
            address: this.announcement?.address,
            name: this.announcement?.name
        }
    }

    get services(): BleService[] {
        const services =  this.announcement?.serviceUUIDs??[]
        return services.map(s => ({uuid:s}))
    }

    getAnnouncedServices(): string[] {
        return this.announcement?.serviceUUIDs.map(s=>beautifyUUID(s))
    }

    getDiscoveredServices():string[] { 
        return this.discoveredServiceUUIds

    }

    async connect(): Promise<boolean> {
        if (this.isConnected())
            return true;

        if (this.isConnecting())
            await this.connectTask.getPromise()

        this.connectTask = new InteruptableTask(this.startConnection(),{
            timeout:1000,
        })
        return await this.connectTask.run()
    }

    async disconnect(connectionLost:boolean=false): Promise<boolean> {
        try {

            await this.connectTask.stop()
            await this.stopConnection(connectionLost)
            
            delete this.socket

        }
        catch(err) {
            return false
        }
        return true
    }
    isConnected(): boolean {
        return this.socket!==undefined
    }
    isConnecting(): boolean {
        return this.connectTask?.isRunning()
    }

    onDisconnect(callback: () => void): void {
        this.onDisconnectHandler = callback
    }

    async discoverServices(): Promise<string[]> {
        const seqNo = this.getNextSeqNo()
        const message = new DiscoverServiceMessage()
        const request = message.createRequest(seqNo,{})
        let response:Buffer

        this.logEvent({message:'DiscoverServices request', path:this.getPath(), raw:request.toString('hex') })

        try {
            response = await this.send(seqNo, request)

            const res = message.parseResponse(response)

            const uuids = res.body.serviceDefinitions.map(s => beautifyUUID(s.serviceUUID))
            const rc = RC(res?.header?.respCode)
            if (res?.header?.respCode!==DC_RC_REQUEST_COMPLETED_SUCCESSFULLY) {
                this.logEvent({message:'DiscoverServices failed', path:this.getPath(), raw:response?.toString('hex'), reason:rc })                
                return []
            }

            this.logEvent({message:'DiscoverServices response',path:this.getPath(), rc,  uuids , raw:response.toString('hex') })
            this.discoveredServiceUUIds = res.body.serviceDefinitions.map(s => beautifyUUID(s.serviceUUID))
            return res.body.serviceDefinitions.map(s => s.serviceUUID)        
        }
        catch(err) {
            this.logEvent({message:'DiscoverServices failed', path:this.getPath(), raw:response?.toString('hex'), reason:err.message })
            return []
        }
    }
    async discoverCharacteristics(serviceUUID: string): Promise<BleCharacteristic[]> {
        const seqNo = this.getNextSeqNo()
        const message = new DiscoverCharacteristicsMessage() 
        const request = message.createRequest(seqNo,{serviceUUID:parseUUID(serviceUUID)})
        let response:Buffer

        this.logEvent({message:'DiscoverCharacteritics request', path:this.getPath(), service:beautifyUUID(serviceUUID), raw:request.toString('hex') })

        try {
            response = await this.send(seqNo, request)

            const res = message.parseResponse(response)

            const rc = RC(res?.header?.respCode)
            if (res?.header?.respCode!==DC_RC_REQUEST_COMPLETED_SUCCESSFULLY) {
                this.logEvent({message:'DiscoverCharacteritics failed', path:this.getPath(), raw:response?.toString('hex'), reason:rc })                
                return []
            }

            const service = beautifyUUID(res.body.serviceUUID)
            const characteristics = res.body.characteristicDefinitions.map(cd => `${beautifyUUID(cd.characteristicUUID)}:${cd.properties.join('/')}`)

            this.logEvent({message:'DiscoverCharacteritics response',path:this.getPath(), rc,service,characteristics , raw:response.toString('hex') })

            return res.body.characteristicDefinitions.map(c => ({uuid:c.characteristicUUID, properties:c.properties}))
        }
        catch(err) {
            this.logEvent({message:'DiscoverCharacteritics failed', path:this.getPath(), raw:response?.toString('hex'), reason:err.message })
            return []
        }
    }
    async subscribe(characteristicUUID: string, callback?: (characteristicUuid: string, data: Buffer) => void): Promise<boolean> {

        // already subscribed? No need to re-send the request
        const uuid = parseUUID(characteristicUUID)
        if (this.subscribed.includes(uuid)) {
            return true
        }

        console.log('# subscribe ',characteristicUUID)
        const seqNo = this.getNextSeqNo()
               
        const message = new EnableCharacteristicNotificationsMessage() 
        const request = message.createRequest(seqNo,{characteristicUUID:parseUUID(characteristicUUID),enable:true})
        let response:Buffer

        this.logEvent({message:'EnableCharacteristicNotifications request', path:this.getPath(), characteristic:beautifyUUID(characteristicUUID),enabled:true, raw:request.toString('hex') })

        try {
            response = await this.send(seqNo, request)

            const res = message.parseResponse(response)
            const rc = RC(res?.header?.respCode)
            if (res?.header?.respCode!==DC_RC_REQUEST_COMPLETED_SUCCESSFULLY) {
                this.logEvent({message:'EnableCharacteristicNotifications failed', path:this.getPath(), raw:response?.toString('hex'), reason:rc })                
                return false
            }


            this.logEvent({message:'EnableCharacteristicNotifications response', path:this.getPath(), rc, characteristic:beautifyUUID(res.body.characteristicUUID), raw:response.toString('hex') })

            const confirmed =  res.body.characteristicUUID

            if ( parseUUID(confirmed) === parseUUID(characteristicUUID)) {
                this.subscribed.push(parseUUID(characteristicUUID))
                if (callback) {
                    this.eventEmitter.on(parseUUID(characteristicUUID), (data)=>{
                        callback(characteristicUUID,data)
                    })
                }
                return true
            }
            return false
        }
        catch(err) {
            this.logEvent({message:'EnableCharacteristicNotifications failed', path:this.getPath(), raw:response?.toString('hex'), reason:err.message })
            return false
        }
    }
    async unsubscribe(characteristicUUID: string): Promise<boolean> {
        try {
            const seqNo = this.getNextSeqNo()
            const message = new EnableCharacteristicNotificationsMessage() 
            const request = message.createRequest(seqNo,{characteristicUUID:parseUUID(characteristicUUID),enable:false})
            let response:Buffer

            try {
                this.logEvent({message:'EnableCharacteristicNotifications request', path:this.getPath(), characteristic:beautifyUUID(characteristicUUID),enabled:false, raw:request.toString('hex') })

                response = await this.send(seqNo, request)

                const res = message.parseResponse(response)
                const rc = RC(res?.header?.respCode)
                if (res?.header?.respCode!==DC_RC_REQUEST_COMPLETED_SUCCESSFULLY) {
                    this.logEvent({message:'EnableCharacteristicNotifications failed', path:this.getPath(), raw:response?.toString('hex'), reason:rc })                
                    return false
                }
    

                this.logEvent({message:'EnableCharacteristicNotifications response', path:this.getPath(), rc,characteristic:beautifyUUID(res.body.characteristicUUID), raw:response.toString('hex') })

                const confirmed =  res.body.characteristicUUID

                if ( parseUUID(confirmed) === parseUUID(characteristicUUID)) {
                    this.subscribed.splice(this.subscribed.indexOf(parseUUID(characteristicUUID)),1)
                    this.eventEmitter.removeAllListeners(parseUUID(characteristicUUID))
                    return true
                }
                return false        
            }
            catch(err) {
                this.logEvent({message:'EnableCharacteristicNotifications failed', path:this.getPath(), raw:response?.toString('hex'), reason:err.message })
                return false
            }
        }
        catch(err) {
            this.logEvent( {messsage:'EnableCharacteristicNotifications failed',reason:err.message})
            return false
        }
    }

    async subscribeAll(callback: (characteristicUuid: string, data: Buffer) => void): Promise<boolean> {
        try {
            let services = []
            try {
                services = await this.discoverServices()
            }
            catch(err) {
                this.logEvent({message:'could not discover services',reason:err.message})
            }            

            for (const element of services) {
                const service = element
                let characteristics = []
                try {
                    characteristics = await this.discoverCharacteristics(service)
                }
                catch(err) { 
                    this.logEvent({message:'could not discover characteristics', service,  reason:err.message})
                    return false;
                }

                if (!characteristics?.length)
                    continue
                for (const element of characteristics) {         
                    const characteristic = element
                    if ( characteristic.properties.includes('notify'))
                        await this.subscribe(characteristic.uuid, callback)
                }
            }

            return true
        }
        catch(err) {
            this.logEvent({message:'could not subscribe',reason:err.message})
            return false
        }
    }

    async subscribeSelected(characteristics:string[], callback: (characteristicUuid: string, data: Buffer) => void): Promise<boolean> {


        let services = []
        let supported  = []
        try {
            services = await this.discoverServices()
        }
        catch(err) {
            this.logEvent({message:'could not discover services',reason:err.message})
        }            

        for (const element of services) {
            const service = element
            
            try {
                const c = await this.discoverCharacteristics(service)
                supported = supported.concat(c)
            }
            catch(err) { 
                this.logEvent({message:'could not discover characteristics', service,  reason:err.message})
                return false;
            }
        }

        const retry = []
        this.logEvent({message:'characteristics supported', requested:characteristics.map(c=>beautifyUUID(c)), supported:supported.map(c=>beautifyUUID(c.uuid))})

        for (const element of characteristics) { 
            const uuid = element           

            const found = supported.find(c => beautifyUUID(c.uuid) === beautifyUUID(uuid))
            if (!found) {
                this.logEvent({message:'characteristic not supported', requested:beautifyUUID(uuid)})
            }
            else {
                const success = await this.subscribe(uuid, callback)
                if (!success)
                    retry.push(uuid)    
            }
        }

        for (const element of retry) {
            const c = element
            await this.subscribe(c.uuid, callback)
        }
        return true
    }


    async unsubscribeAll(connectionLost:boolean=false):Promise<void> {

        if (connectionLost) {
            this.subscribed = []
            return
        }
        const promises = []
        this.subscribed.forEach(characteristicUUID => {
            promises.push(this.unsubscribe(parseUUID(characteristicUUID)))
        })

        await Promise.allSettled(promises)
    }

    async read(characteristicUUID: string): Promise<Buffer> {
        const seqNo = this.getNextSeqNo()
        const message = new ReadCharacteristicMessage() 
        const request = message.createRequest(seqNo,{characteristicUUID:parseUUID(characteristicUUID)})
        let response:Buffer

        try {
            this.logEvent({message:'ReadCharacteristic request', path:this.getPath(), characteristic:beautifyUUID(characteristicUUID), raw:request.toString('hex') })

            response = await this.send(seqNo, request)
            const res = message.parseResponse(response)
            const rc = RC(res?.header?.respCode)
            if (res?.header?.respCode!==DC_RC_REQUEST_COMPLETED_SUCCESSFULLY) {
                this.logEvent({message:'ReadCharacteristic failed', path:this.getPath(), raw:response?.toString('hex'), reason:rc })                
                return Buffer.from([])
            }


            this.logEvent({message:'ReadCharacteristic response', path:this.getPath(), rc,characteristic:beautifyUUID(res.body.characteristicUUID),
                    data:Buffer.from(res.body.characteristicData).toString('hex'),    
                    raw:response.toString('hex') })

            return Buffer.from(res.body.characteristicData)
        }
        catch(err) {
            this.logEvent({message:'ReadCharacteristic failed', path:this.getPath(), raw:response?.toString('hex'), reason:err.message })
            return Buffer.from([])
        }
    }
    async write(characteristicUUID: string, data: Buffer, options?: BleWriteProps): Promise<Buffer> {
        return new Promise( resolve => {

            const seqNo = this.getNextSeqNo()
            const message = new WriteCharacteristicMessage()
            const request = message.createRequest(seqNo,{characteristicUUID:parseUUID(characteristicUUID), characteristicData:data})
            let response:Buffer
            let characteristic = characteristicUUID


            if ( !options?.withoutResponse ) {                
                this.subscribe(characteristicUUID)
                const uuid = parseUUID(characteristicUUID)
                this.eventEmitter.once(uuid, (data)=>{
                    resolve(data)
                })
            }    

            this.logEvent({message:'WriteCharacteristic request', path:this.getPath(), characteristic:beautifyUUID(characteristicUUID), 
                data:data.toString('hex'),    
                raw:request.toString('hex') })

            this.send(seqNo, request).then ( (data:Buffer) =>{
                response = data
                const res = message.parseResponse(response)
                const rc = RC(res?.header?.respCode)
                if (res?.header?.respCode!==DC_RC_REQUEST_COMPLETED_SUCCESSFULLY) {
                    this.logEvent({message:'WriteCharacteristic failed', path:this.getPath(), raw:response?.toString('hex'), reason:rc })                
                    resolve(Buffer.from([]))
                    return 
                }
    
                characteristic = beautifyUUID(res.body.characteristicUUID)
                this.logEvent({message:'WriteCharacteristic response', path:this.getPath(),rc, characteristic,                
                    raw:response.toString('hex') })
    
                if ( options?.withoutResponse ) {
                    resolve (Buffer.from([]))
                }    
            })
            .catch(err =>{
                this.logEvent({message:'WriteCharacteristic failed', path:this.getPath(), characteristic,raw:response?.toString('hex'), reason:err.message})
                resolve(Buffer.from([]))
            })



            
        })
        
    }

    protected async startConnection(): Promise<boolean> {
        
        const {address,port}  = this.announcement
        
        try {
            const net = this.getBinding().net

            this.socket = net.createSocket()
            return new Promise((resolve, reject) => {
                //socket.setTimeout(options.timeout||DEFAULT_TIMEOUT)

                this.socket.once('timeout',()=>{ 
                    this.stopConnection().then( ()=>resolve(false) )                    
                    
                    //reject(new Error('timeout'))
                })
                this.socket.once('error',(err)=>{ 
                    this.stopConnection().then( ()=>resolve(false) )                    
                    //reject(err)
                })
                this.socket.once('connect',()=>{ 
                    this.socket.on('data', this.onDataHandler)
                    this.socket.on('error',this.onPortErrorHandler )
                    this.socket.on('close',this.onPortCloseHandler)
                    this.socket.on('end', this.onPortCloseHandler)
            
                    resolve(true)
                })
    
                this.socket.connect(port, address)
    
            })

        }
        catch(err) {
            return false
        }
    }

    protected onPortError(err:Error) { 
        this.logEvent({message:'port error', path:this.getPath(), reason:err.message})

    }

    protected async onPortClose() {       
        this.socket.removeAllListeners();
        this.socket.on('error',()=>{}) // ignore port errors
        this.logEvent({message:'port closed', path:this.getPath()}) 
        
        try {
            await this.disconnect(true)
        }
        catch {}

        if (this.onDisconnectHandler)
            this.onDisconnectHandler()
    }

    protected getPath():string {
        const {address,port}  = this.announcement
        const path = `${address}:${port}`
        return path
    }


    protected async stopConnection(connectionLost:boolean=false):Promise<boolean> {
        this.eventEmitter.removeAllListeners()

        if (!this.isConnected())
            return true;

        
        await this.unsubscribeAll(connectionLost)
        // remove all old listeners
        this.socket.removeAllListeners()

        return new Promise(done => {
            const onClosed = ()=> {
                this.socket.removeAllListeners()
                delete this.socket
                done(true)
            }
    
            const onCloseError = (err)=> {
                this.logEvent({message:'port error', path:this.getPath(), reason:err.message})
                this.socket.removeAllListeners()
                delete this.socket
                done(false)
    
            }
            this.socket.on('end',onClosed)
            this.socket.on('error',onCloseError)
            this.socket.on('close',onClosed)
    
            this.socket.destroy()
                
        })
       
    }

    protected getNextSeqNo():number {
        this.msgSeqNo = (this.msgSeqNo+1) % 256
        return this.msgSeqNo
    }
    protected async send(seqNo:number, data:Buffer):Promise<Buffer> {        
        this.socket.write(data)

        return new Promise( done  => {
            this.eventEmitter.once(`response-${seqNo}`, (response:Buffer) => {
                done(response)
            })                
            
        })        
    }

    protected getNextMessage(data:Buffer):Buffer {
        let incoming = data

        if (this.partialBuffer) {
            incoming = Buffer.concat([
                Buffer.from(this.partialBuffer),
                Buffer.from(data)
            ]) 
            delete this.partialBuffer
        }

        if (incoming.length<6) {
            this.partialBuffer = Buffer.from(incoming)
            return null;
        }

        const header = parseHeader(incoming)

        if (incoming.length<header.length+6) {
            this.partialBuffer = Buffer.from(incoming)
            return null
        }

        if (incoming.length>header.length+6) {
            this.remainingBuffer = Buffer.from(incoming.subarray(header.length+6))

            incoming = Buffer.from(incoming.subarray(0, header.length+6))
        }

        return incoming
    }

    protected processRemaining() {
        if (this.remainingBuffer) {
            const next = Buffer.from(this.remainingBuffer)
            delete this.remainingBuffer
            this.onData(next)
        }
    }

    protected async onData(data:Buffer) {


        const incoming = this.getNextMessage(data)

        if (incoming===null)
            return

        try {
            const header = parseHeader(incoming)
            if (header.msgId===DC_MESSAGE_CHARACTERISTIC_NOTIFICATION) {
                // emit data

                const message = new CharacteristicNotificationMessage()
                const notification = message.parseResponse(incoming)
                this.msgSeqNo = notification.header.seqNum
                    const uuid =parseUUID(notification.body.characteristicUUID)

                this.logEvent({message:'Characteristic notification', path:this.getPath(), characteristic:beautifyUUID(notification.body.characteristicUUID),
                    data:Buffer.from(notification.body.characteristicData).toString('hex'), raw:incoming.toString('hex') })

                this.eventEmitter.emit(uuid, notification.body.characteristicData)    
            }
            else {
                //this.logEvent({message:'incoming message', path:this.getPath(), raw:incoming.toString('hex'), header})
                this.eventEmitter.emit(`response-${header.seqNum}`, incoming)
            }
        }
        catch(err) {
            this.logEvent({message:'error', fn:'onData', error:err.message,  stack:err.stack,path:this.getPath(), raw:incoming.toString('hex')})
        }
        this.processRemaining()

        
    }


    protected getInterface (): DirectConnectInterface {
        return DirectConnectInterface.getInstance()
    }

    protected logEvent(event:any) {
        this.getInterface().logEvent(event)
    }

 

    protected getBinding(): DirectConnectBinding {
        return this.getInterface().getBinding()
    }
    
    

}