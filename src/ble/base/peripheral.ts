import { BleCharacteristic, BlePeripheralAnnouncement, BleRawCharacteristic, BleRawPeripheral, BleService, BleWriteProps, IBlePeripheral } from "../types";
import { beautifyUUID, fullUUID, parseUUID } from "../utils";
import { BleInterface } from "./interface";

export class BlePeripheral implements IBlePeripheral {

    protected connected = false
    protected characteristics: Record<string, BleRawCharacteristic> = {}
    protected onDisconnectHandler?: () => void
    protected ble: BleInterface
    protected subscribed: Array<{uuid:string,callback:(data:Buffer)=>void}> = [] 
    protected disconnecting: boolean = false

    constructor(protected announcement:BlePeripheralAnnouncement) { 
        this.ble = BleInterface.getInstance()
        
    }
    get services(): BleService[] {
        return this.announcement.peripheral.services
    }

    protected getPeripheral():BleRawPeripheral {
        return this.announcement.peripheral
    }

    async connect(): Promise<boolean> {
        if (this.isConnected())
            return true;

        await this.getPeripheral().connectAsync()
        this.ble.registerConnected(this)
        this.connected = true;
        return this.connected
    }
    async disconnect(): Promise<boolean> {
        this.disconnecting = true
        if (!this.isConnected())
            return true;

        await this.unsubscribeAll()
        Object.keys(this.characteristics).forEach( uuid=> { 
            const c = this.characteristics[uuid] 
            c.removeAllListeners()
        })

        // old versions of the app did not support disconnectAsync
        // so we need to "promisify" the disconnect
        if (!this.getPeripheral().disconnectAsync) {
            this.getPeripheral().disconnectAsync = ():Promise<void>=> {
                return new Promise ( (done) => { this.getPeripheral().disconnect(()=> {done()} )})
            }
        }

        await this.getPeripheral().disconnectAsync()
        
        this.connected = false;
        this.disconnecting = false
        return !this.connected
    }

    isConnected(): boolean {
        return this.connected
    }
    isConnecting(): boolean {
        return false
    }

    onDisconnect(callback: () => void): void {
        this.onDisconnectHandler = callback
    }

    async discoverServices(): Promise<string[]> {
        
        if (this.getPeripheral().discoverServicesAsync) {
            this.logEvent({message:'discover services'})
            const services = await this.getPeripheral().discoverServicesAsync([])
            return services.map(s=>s.uuid)    
        }
        else {
            this.logEvent({message:'discover services and characteristics'})
            const res = await this.getPeripheral().discoverSomeServicesAndCharacteristicsAsync([],[])                
            return res.services.map(s=>s.uuid)
        }
    }

    async discoverCharacteristics(serviceUUID: string): Promise<BleCharacteristic[]> {
        const res = await this.getPeripheral().discoverSomeServicesAndCharacteristicsAsync([serviceUUID],[])                
        res.characteristics.forEach( c => this.characteristics[beautifyUUID(c.uuid)] = c)

        return res.characteristics.map( c => {
            const  {uuid,properties,name,_serviceUuid} = c
            return {uuid,properties,name,_serviceUuid} 
        })
    }


    async subscribe(characteristicUUID: string, callback: (characteristicUuid: string, data: Buffer) => void): Promise<boolean> {
        try {
            if (this.disconnecting || !this.connected)
                return false

            const onData=(data:Buffer):void => {                        
                try {
                    //this.logEvent({message:'notify', characteristic:beautifyUUID(uuid),data:Buffer.from(data).toString('hex') })
                    callback(characteristicUUID,data)                        
                }
                catch {}
            }

            const subscription = this.subscribed.find( s => s.uuid ===characteristicUUID)
            if (subscription) {
                const c = this.getRawCharacteristic(characteristicUUID)
                if (c)
                    c.on('data',onData)
                return true
            }

            const c = this.getRawCharacteristic(characteristicUUID)
            if (!c) {
                return false
            }

            return new Promise( (resolve,reject) => {

                const info = this.subscribed.find( s => s.uuid ===characteristicUUID)
                if (info) {
                    // already subscribed
                    return Promise.resolve(true)
                }

                const uuid = beautifyUUID(characteristicUUID)
                this.logEvent({message:'subscribe request', characteristic:uuid, success:true})
                c.subscribe( (err:Error|undefined) => {
                    if (err) {
                        this.logEvent({message:'subscribe result', characteristic:uuid, success:false, reason:err.message})                    
                        resolve(false)
                    }
                    else {
                        if (callback) {
                            this.subscribed.push( {uuid:characteristicUUID,callback:onData})
                            c.on('data',onData)
                        }
                        else  {
                            this.subscribed.push( {uuid:characteristicUUID,callback:null})
                        }
                        this.logEvent({message:'subscribe result', characteristic:uuid, success:true})
                        resolve(true)
                    }
                })
            })
        }
        catch(err) {
            this.logEvent( {message:'Error', fn:'subscribe', error:err.message, stack:err.stack})
            return false
        }        
    }
    unsubscribe(characteristicUUID: string): Promise<boolean> {
        try {

            const subscription = this.subscribed.find( s => s.uuid ===characteristicUUID)
            if (!subscription) {
                return Promise.resolve(true)
            }
            const c = this.getRawCharacteristic(characteristicUUID)
            if (!c) {
                return Promise.resolve(false)
            }
            return new Promise( (resolve,reject) => {
                c.unsubscribe( (err:Error|undefined) => {
                    if (err) {
                        resolve(false)
                    }
                    else {
                        const info = this.subscribed.find( s => s.uuid ===characteristicUUID)
                        if (info) {
                            this.subscribed.splice(this.subscribed.indexOf(info),1)
    
                            if (info.callback)
                                c.off('data',info.callback)
                        }
                        resolve(true)
                    }
                })
            })
    
        }
        catch(err) {
            this.logEvent( {message:'Error', fn:'unsubscribe', error:err.message, stack:err.stack})
            return Promise.resolve(false)
        }


        
    }

    async subscribeSelected(characteristics:string[], callback: (characteristicUuid: string, data: Buffer) => void): Promise<boolean> {

        try {
            if (Object.keys(this.characteristics).length===0) {
                await this.discoverAllCharacteristics();
            }
            const retry = []
    
            for (let i=0;i<characteristics.length;i++) {            
                const c = this.getRawCharacteristic(characteristics[i])
                if (c?.properties.includes('notify')) {
                    const success = await this.subscribe(c.uuid, callback)
                    if (!success)
                        retry.push(c)
                }
            }
    
            for (let i=0;i<retry.length;i++) {
                const c = retry[i]
                await this.subscribe(c.uuid, callback)
            }
            return true
    
        }
        catch(err) {
            this.logEvent( {message:'Error', fn:'subscribeSelected', error:err.message, stack:err.stack})
            return false
        }
    }

    async discoverAllCharacteristics():Promise<string[]> {   
        try {     
            const res = await this.getPeripheral().discoverSomeServicesAndCharacteristicsAsync([],[])                

            const found = []
            res.characteristics.forEach(c => {
                this.characteristics[beautifyUUID(c.uuid)] = c
                found.push(c.uuid)
            });
            return found        
        }
        catch(err) {
            this.logEvent( {message:'Error', fn:'discoverAllCharacteristics', error:err.message, stack:err.stack})
            return []
        }
    }

    async discoverSomeCharacteristics(characteristics:string[]):Promise<string[]> {   
        try {     
            const target = characteristics.map(c=> fullUUID(c))
            const res = await this.getPeripheral().discoverSomeServicesAndCharacteristicsAsync([],target)                

            const found = []
            res.characteristics.forEach(c => {
                this.characteristics[beautifyUUID(c.uuid)] = c
                found.push(c.uuid)
            });
            return found        
        }
        catch(err) {
            this.logEvent( {message:'Error', fn:'discoverAllCharacteristics', error:err.message, stack:err.stack})
            return []
        }
    }

    async subscribeAll(callback: (characteristicUuid: string, data: Buffer) => void): Promise<boolean> {        
        const characteristics = await this.discoverAllCharacteristics()
        const success = await this.subscribeSelected(characteristics,callback)
        return success
    }

    async unsubscribeAll():Promise<boolean> {
        const promises = []
        this.subscribed.forEach(d => {
            promises.push(this.unsubscribe(d.uuid))
        })

        await Promise.allSettled(promises)
        return true
    }

    read(characteristicUUID: string): Promise<Buffer> {
        if (this.disconnecting || !this.connected)
            return Promise.resolve(Buffer.from([]))

        const c = this.characteristics[beautifyUUID(characteristicUUID)]
        if (!c) {
            return Promise.reject( new Error('characteristic not found'))
        }
        return new Promise( (resolve,reject) => {
            c.read( (err:Error|undefined, data:Buffer) => {
                if (err) {
                    reject(err)
                }
                else {
                    resolve(data)
                }
            })
        })

    }
    write(characteristicUUID: string, data: Buffer, options?: BleWriteProps): Promise<Buffer> {
        if (this.disconnecting || !this.connected)
            return Promise.resolve(Buffer.from([]))

        const uuid = beautifyUUID(characteristicUUID)
        const c = this.characteristics[uuid]
        if (!c) {
            return Promise.reject( new Error('characteristic not found'))
        }
        return new Promise( (resolve,reject) => {

            

            this.subscribe(characteristicUUID,null).then( success => {
                if (this.disconnecting || !this.connected)
                    return Promise.resolve(Buffer.from([]))
        
                c.on('data', (data)=>{
                    c.removeAllListeners('data')
                    resolve(data)
                })

                this.logEvent({message:'write request', characteristic:uuid, data:data.toString('hex'), withoutResponse:options?.withoutResponse===true})
    
                c.write( data, options?.withoutResponse===true,(err) =>{
                    if (err) 
                        reject(err)
                })

                if (options?.withoutResponse) {
                    resolve(Buffer.from([]))
                }   
    
            })

        })

    }

    protected getRawCharacteristic(uuid:string):BleRawCharacteristic {
        return this.characteristics[beautifyUUID(uuid)]       

    }

    logEvent( event) {
        this.ble.logEvent(event)
    }


}