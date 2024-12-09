import { BleCharacteristic, BleService, BleWriteProps, IBlePeripheral, } from "../../ble/types";
import { DirectConnectBinding, MulticastDnsAnnouncement } from "../bindings";
import { InteruptableTask, TaskState } from "../../utils/task";
import DirectConnectInterface from "./interface";
import { CharacteristicNotificationMessage, DiscoverCharacteristicsMessage, DiscoverServiceMessage, EnableCharacteristicNotificationsMessage, parseHeader, ReadCharacteristicMessage, WriteCharacteristicMessage } from "../messages";
import EventEmitter from "events";
import { DC_MESSAGE_CHARACTERISTIC_NOTIFICATION } from "../consts";
import {  parseUUID } from "../../ble/utils";
import { Socket } from "net";

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
    
    protected eventEmitter = new EventEmitter()

    protected onDisconnectHandler: ()=>void;

    constructor( protected announcement:MulticastDnsAnnouncement) { 
        
    }
    get services(): BleService[] {
        const services =  this.announcement.serviceUUIDs
        return services.map(s => ({uuid:s}))
    }

    async connect(): Promise<boolean> {
        // console.log('~~ connect',this.isConnected())
        if (this.isConnected())
            return true;

        if (this.isConnecting())
            await this.connectTask.getPromise()

        this.connectTask = new InteruptableTask(this.startConnection(),{
            timeout:1000,
        })
        return await this.connectTask.run()
    }

    async disconnect(): Promise<boolean> {
        try {

            await this.connectTask.stop()
            await this.stopConnection()
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
        const response:Buffer = await this.send(seqNo, request)

        const res = message.parseResponse(response)
        return res.body.serviceDefinitions.map(s => s.serviceUUID)        
    }
    async discoverCharacteristics(serviceUUID: string): Promise<BleCharacteristic[]> {
        const seqNo = this.getNextSeqNo()
        const message = new DiscoverCharacteristicsMessage() 
        const request = message.createRequest(seqNo,{serviceUUID:parseUUID(serviceUUID)})
        const response:Buffer = await this.send(seqNo, request)

        const res = message.parseResponse(response)
        return res.body.characteristicDefinitions.map(c => ({uuid:c.characteristicUUID, properties:c.properties}))
    }
    async subscribe(characteristicUUID: string, callback: (characteristicUuid: string, data: Buffer) => void): Promise<boolean> {
        // console.log('subscribe',characteristicUUID)

        const seqNo = this.getNextSeqNo()
        const message = new EnableCharacteristicNotificationsMessage() 
        const request = message.createRequest(seqNo,{characteristicUUID:parseUUID(characteristicUUID),enable:true})
        const response:Buffer = await this.send(seqNo, request)

        const res = message.parseResponse(response)
        const confirmed =  res.body.characteristicUUID

        if ( parseUUID(confirmed) === parseUUID(characteristicUUID)) {
            this.eventEmitter.on(parseUUID(characteristicUUID), (data)=>{
                callback(characteristicUUID,data)
            })
            return true
        }
        return false

    }
    async unsubscribe(characteristicUUID: string): Promise<boolean> {
        //console.log('unsubscribe',characteristicUUID)

        const seqNo = this.getNextSeqNo()
        const message = new EnableCharacteristicNotificationsMessage() 
        const request = message.createRequest(seqNo,{characteristicUUID:parseUUID(characteristicUUID),enable:false})
        const response:Buffer = await this.send(seqNo, request)

        const res = message.parseResponse(response)
        const confirmed =  res.body.characteristicUUID

        if ( parseUUID(confirmed) === parseUUID(characteristicUUID)) {
            this.eventEmitter.removeAllListeners(parseUUID(characteristicUUID))
            return true
        }
        return false        
    }

    async subscribeAll(callback: (characteristicUuid: string, data: Buffer) => void): Promise<boolean> {

        //console.log('~~ subscribeAll')
        try {
            const services = await this.discoverServices()

            const getServices:Promise<BleCharacteristic[]>[] =  []
            
            services.forEach (service=> 
                getServices.push(this.discoverCharacteristics(service).catch(err=>null) )
            )
            const res = await Promise.all(getServices)

            const subscribe:Promise<boolean>[] = []
            res.forEach(characteristics => {
                if (!characteristics?.length)
                    return
                characteristics.forEach(characteristic => {
                    if ( characteristic.properties.includes('notify'))
                        subscribe.push(this.subscribe(characteristic.uuid, callback).catch(err=>null))
                })
            })
            const res2 = await Promise.all(subscribe)

            return true
        }
        catch(err) {
            this.logEvent({message:'could not subscribe',reason:err.message})
            return false
        }
    }

    async read(characteristicUUID: string): Promise<Buffer> {
        //console.log('read',characteristicUUID,characteristicUUID) 

        const seqNo = this.getNextSeqNo()
        const message = new ReadCharacteristicMessage() 
        const request = message.createRequest(seqNo,{characteristicUUID:parseUUID(characteristicUUID)})
        const response:Buffer = await this.send(seqNo, request)

        const res = message.parseResponse(response)
        return Buffer.from(res.body.characteristicData)
        
    }
    async write(characteristicUUID: string, data: Buffer, options?: BleWriteProps): Promise<Buffer> {

        //console.log('write',characteristicUUID,data.toString('hex')) 
        return new Promise( async resolve => {

            if ( !options?.withoutResponse ) {

                const uuid = parseUUID(characteristicUUID)
                //console.log('waiting for ....',uuid)    
                this.eventEmitter.once(uuid, (data)=>{
                    //console.log('with response',data.toString('hex'))
                    resolve(data)
                })
    
            }

            const seqNo = this.getNextSeqNo()
            const message = new WriteCharacteristicMessage()
            const request = message.createRequest(seqNo,{characteristicUUID:parseUUID(characteristicUUID), characteristicData:data})
            const response:Buffer = await this.send(seqNo, request)

            const res = message.parseResponse(response)

            if ( options?.withoutResponse ) {
                //console.log('no response')
                resolve (Buffer.from([]))
            }

            
        })
        
    }

    protected async startConnection(): Promise<boolean> {
        
        const {address,port}  = this.announcement
        

        try {
            const net = await this.getBinding().net
            this.socket = new net.Socket()
            
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


            //this.socket = new SerialPortStream()
            /*

            console.log('port',port, path)    
            if (!port) {            
                this.logEvent({message:'opening port - port does not exist',port:path})
                return null;
            }
    
            return new Promise( (resolve) => {
                port.once('error',(err)=>{ 
                    this.logEvent({message:'port error', path, reason:err.message})
                    port.removeAllListeners()
                    resolve(false); 
                })
                port.once('open',()=>{
                    this.logEvent({message:'port opened',path})
                    port.removeAllListeners()                    
                    this.socket = port;

                    port.on('data',this.onDataHandler)
                    port.on('close', this.onPortCloseHandler);            
                    port.on('error', this.onPortErrorHandler);            

                    resolve(true); 
                })
                port.open()        
            })
                */            
        }
        catch(err) {
            console.log(err)
            return false
        }
    }

    protected onPortError(err:Error) { 
        console.log('~~~ Port error', this.getPath(), err.message)
        this.logEvent({message:'port error', path:this.getPath(), reason:err.message})

    }

    protected async onPortClose() {       
        console.log('~~~ Port closed', this.getPath())
        this.socket.removeAllListeners();
        this.logEvent({message:'port closed', path:this.getPath()}) 
        
        try {
            await this.disconnect()
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


    protected async stopConnection():Promise<boolean> {

        this.eventEmitter.removeAllListeners()

        if (!this.isConnected())
            return true;

        this.socket.removeAllListeners()
        this.socket.destroy()
        delete this.socket
    }

    protected getNextSeqNo():number {
        this.msgSeqNo = (this.msgSeqNo+1) % 256
        return this.msgSeqNo
    }
    protected async send(seqNo:number, data:Buffer):Promise<Buffer> {        
        console.log('<< ',data.toString('hex'))
        this.socket.write(data)

        return new Promise( done  => {
            this.eventEmitter.once(`response-${seqNo}`, (response:Buffer) => {
                done(response)
            })                
            
        })        
    }

    protected onData(data:Buffer) {
        const header = parseHeader(data)
        console.log('>> [',header.length,']',data.toString('hex'))

        if (data.length>header.length+6) {
            this.onData(data.subarray(0, header.length-1))
            this.onData(data.subarray(header.length))
            return
        }
            

        if (header.msgId===DC_MESSAGE_CHARACTERISTIC_NOTIFICATION) {
            // emit data

            const message = new CharacteristicNotificationMessage()
            const notification = message.parseResponse(data)
            this.msgSeqNo = notification.header.seqNum
            const uuid =parseUUID(notification.body.characteristicUUID)
            console.log('emitting',uuid)    
            this.eventEmitter.emit(uuid, notification.body.characteristicData)
        }
        else {
            this.eventEmitter.emit(`response-${header.seqNum}`, data)
        }
        
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