import { sleep } from "../../utils/utils.js";
import { BleCharacteristic, BleDeviceIdentifier, BlePeripheralAnnouncement, BleRawCharacteristic, BleRawPeripheral, BleService, BleWriteProps, IBleInterface, IBlePeripheral } from "../types.js";
import { beautifyUUID, fullUUID, matches, uuid } from "../utils.js";
import { BleInterface } from "./interface.js";

export class BlePeripheral implements IBlePeripheral {

    protected connected = false
    protected connectPromise:Promise<void>|undefined
    protected characteristics: Record<string, BleRawCharacteristic> = {}        // known characteristics
    protected onDisconnectHandler?: () => void
    protected ble: BleInterface
    protected subscribed: Array<{uuid:string,callback:(data:Buffer)=>void}> = [] 
    protected disconnecting: boolean = false
    protected disconnectedSignalled: boolean = false
    protected discoveredServiceUUIds: Array<string>|undefined

    protected discoverServicesPromise: Promise<string[]>|undefined
    protected discoverCharacteristicsPromise: Record<string,Promise<BleCharacteristic[]>|undefined> = {}

    protected onErrorHandler = this.onPeripheralError.bind(this)

    constructor(protected announcement:BlePeripheralAnnouncement) { 
        this.ble = BleInterface.getInstance()
        
    }
    get services(): BleService[] {
        return this.announcement.peripheral.services
    }

    getPeripheral():BleRawPeripheral {
        return this.announcement.peripheral
    }

    getInterface():IBleInterface<any> {
        return this.ble
    }

    getAnnouncedServices(): string[] {
        return this.announcement.serviceUUIDs.map( s=> beautifyUUID(s))
    }
    getDiscoveredServices(): string[] {
        return this.discoveredServiceUUIds ??[]
    }

    getInfo(): BleDeviceIdentifier {
        return {
            id: this.announcement?.peripheral?.id,
            address: this.announcement?.peripheral?.address,
            name: this.announcement?.advertisement?.localName ?? this.announcement?.peripheral?.id,
        }
    }


    async connect(): Promise<boolean> {
        if (this.isConnected())
            return true;

        

        if (this.connectPromise!==undefined) {
            return this.connectPromise.then( ()=>this.connected)
        }

        let address

        this.connectPromise = new Promise<void> ( (done) => {

            const peripheral = this.getPeripheral()
            this.connected = false;

            if (!peripheral?.id)
                return done()

            const peripheralId: string = peripheral.id
            this.ble.unregisterConnected(peripheral.id)            
            if (!this.ble.isConnected()) {
                return done()
            }
            address = peripheral.address

            this.logEvent({message:'connect peripheral',address})
            peripheral.connectAsync().then( ()=>{
                this.ble.registerConnected(this as IBlePeripheral,peripheralId)
                peripheral.once('disconnect',()=>{ this.onPeripheralDisconnect() })
                peripheral.on('error',this.onErrorHandler)
        
                this.connected = true;
                done()
    
            })
            .catch( ()=> {
                this.connected = false
                done()
            })
        })

        await this.connectPromise
        delete this.connectPromise

        this.logEvent({message:'connect peripheral result',address, connected:this.connected})

        return this.connected
    }
    async disconnect(connectionLost:boolean=false): Promise<boolean> {

        this.disconnecting = true

        if (this.isConnected() || connectionLost) {            
            await this.unsubscribeAll(connectionLost)
        }

        Object.keys(this.characteristics).forEach( uuid=> { 
            const c = this.characteristics[uuid] 
            c.removeAllListeners()
        })

        // unregisterall characteristics
        this.characteristics = {}

        // there should be no subscription left
        this.subscribed = []


        const peripheral = this.getPeripheral()
        if (peripheral) {
            if (!connectionLost) {
                // old versions of the app did not support disconnectAsync
                // so we need to "promisify" the disconnect
                this.logEvent({message:'disconnect peripheral',address:peripheral.address})

                if (!peripheral.disconnectAsync) {
                    peripheral.disconnectAsync = ():Promise<void>=> {
                        return new Promise ( (done) => { this.getPeripheral().disconnect(()=> {done()} )})
                    }
                }
    
                await this.getPeripheral().disconnectAsync()
                    .catch( ()=>{})

            }
    
            peripheral.removeAllListeners()            
            this.ble.unregisterConnected(peripheral.id!)
        }
        else {
            delete this.onDisconnectHandler
        }


        this.connected = false;
        this.disconnecting = false
        this.logEvent({message:'peripheral disconnect completed',address:peripheral.address})

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

    getManufacturerData() {
        return this.announcement?.manufacturerData
    }

    getServiceData(uuid:string): Buffer|undefined {
        const serviceData = this.announcement?.serviceData

        if (!serviceData)
            return;

        const data = serviceData.find( sd=> matches(sd.uuid,uuid))?.data
        if (data)
            return Buffer.from(data)
        return data
    }

    protected async onPeripheralDisconnect() {

        // sometimes event was sent twice within 3ms, avoid to process it twice
        if (this.disconnectedSignalled || this.disconnecting)
            return

        this.disconnectedSignalled = true
        this.getPeripheral().removeAllListeners()

        // ensure that this is logged
        this.ble.resumeLogging()

        this.logEvent({message:'peripheral disconnected', address:this.getPeripheral()?.address })
        try {
            await this.disconnect(true)
            this.disconnectedSignalled = false
        }
        catch {}

        if (this.onDisconnectHandler)
            this.onDisconnectHandler()
    }

    protected onPeripheralError(err:Error) {
        this.logEvent({message:'peripheral error', address:this.getPeripheral()?.address,error:err.message })
    }

    async discoverServices(): Promise<string[]> {

        // shield this function from parallel calls
        this.discoverServicesPromise = this.discoverServicesPromise ?? this._discoverServices()
        const promise = this.discoverServicesPromise
        
        const res = await promise
        sleep(0).then(()=> { delete this.discoverServicesPromise} )
        return res

    }

    protected async _discoverServices(): Promise<string[]> {

        if (!this.getPeripheral())
            return []

        const {name,address} = this.getInfo()
        
        if (this.getPeripheral().discoverServicesAsync) {
            this.logEvent({message:'discover services', name,address})
            const peripheral = this.getPeripheral()
            
            let services:BleService[] = []
            if (peripheral?.discoverServicesAsync) {
                services = await peripheral.discoverServicesAsync([])
                    .catch( ()=>[]) 
            }
            

            this.discoveredServiceUUIds = services.map(s=>beautifyUUID(s.uuid))
            this.logEvent({message:'discover services result', name,address, services:this.discoveredServiceUUIds})
            
            return services.map(s=>s.uuid)    
        }
        else {
            this.logEvent({message:'discover services and characteristics', name,address})
            const res = await this.getPeripheral().discoverSomeServicesAndCharacteristicsAsync([],[])    
            
            this.discoveredServiceUUIds = res.services.map(s=>beautifyUUID(s.uuid))
            this.logEvent({message:'discover services result', name,address, services:this.discoveredServiceUUIds})

            return res.services.map(s=>s.uuid)
        }
    }

    async discoverCharacteristics(serviceUUID: string): Promise<BleCharacteristic[]> {

        // shield this function from parallel calls
        this.discoverCharacteristicsPromise[serviceUUID] = this.discoverCharacteristicsPromise[serviceUUID] ?? this._discoverCharacteristics(serviceUUID)
        const promise = this.discoverCharacteristicsPromise[serviceUUID]
        const res = await promise
        sleep(0).then(()=> { delete this.discoverCharacteristicsPromise[serviceUUID]} )
        return res
    }

    protected async _discoverCharacteristics(serviceUUID: string): Promise<BleCharacteristic[]> {
        if (!this.getPeripheral())
            return []

        const {name,address} = this.getInfo()

        this.logEvent({message:'discover services and characteristics',name,address, service:serviceUUID})
        const res = await this.getPeripheral().discoverSomeServicesAndCharacteristicsAsync([serviceUUID],[])
            .catch( ()=> ({services:[], characteristics:[]}))                
        res.characteristics.forEach( c => this.characteristics[beautifyUUID(c.uuid)] = c)

        this.logEvent({message:'discover services and characteristics result',name,address, service:serviceUUID})

        return res.characteristics.map( c => {
            const  {uuid,properties,name,_serviceUuid} = c
            return {uuid,properties,name,_serviceUuid} 
        })
    }


    async subscribe(characteristicUUID: string, callback: (characteristicUuid: string, data: Buffer, isNotify?) => void): Promise<boolean> {

        try {
            if (this.disconnecting || !this.connected) {
                this.logEvent({message:'peripheral subscribe failed', uuid:characteristicUUID, reason:'not connected',
                    disconnecting:this.disconnecting, connected:this.connected
                }) 
                return false
            }

            const uuid = beautifyUUID(characteristicUUID)

            const onData=(data:Buffer, isNotify?:boolean):void => {                        
                try {
                    //this.logEvent({message:'notify', characteristic:beautifyUUID(uuid),data:Buffer.from(data).toString('hex') })
                    callback(characteristicUUID,data,isNotify)                        
                }
                catch {}
            }

            const subscription = this.subscribed.find( s => s.uuid ===uuid)
            if (subscription) {
                this.logEvent({message:'peripheral subscribe skipped', uuid:characteristicUUID, reason:'already subscribed'}) 
                const c = this.getRawCharacteristic(characteristicUUID)
                if (c) {
                    c.off('data',onData)
                    c.on('data',onData)
                }
                return true
            }

            let c = await this.queryRawCharacteristic(characteristicUUID).catch( ()=>null)
            if (!c) {
                this.logEvent({message:'peripheral subscribe failed', uuid:characteristicUUID, reason:'not found'}) 
                return false
            }

            return new Promise( (resolve,reject) => {

                const info = this.subscribed.find( s => s.uuid ===characteristicUUID)
                if (info) {
                    this.logEvent({message:'peripheral subscribe skipped', uuid:characteristicUUID, reason:'already subscribed'}) 
                    // already subscribed
                    return Promise.resolve(true)
                }

                this.logEvent({message:'subscribe request',address:this.getPeripheral().address, characteristic:uuid, success:true})
                c.subscribe( (err:Error|undefined) => {
                    if (err) {
                        this.logEvent({message:'subscribe result',address:this.getPeripheral().address, characteristic:uuid, success:false, reason:err.message})                    
                        resolve(false)
                    }
                    else {
                        if (callback) {
                            this.subscribed.push( {uuid,callback:onData})
                            c.off('data',onData)
                            c.on('data',onData)
                        }
                        else  {
                            this.subscribed.push( {uuid,callback:null})
                        }
                        this.logEvent({message:'subscribe result',address:this.getPeripheral().address, characteristic:uuid, success:true})
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

            const uuid = beautifyUUID(characteristicUUID)

            const subscription = this.subscribed.find( s => s.uuid ===uuid)
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
                        const info = this.subscribed.find( s => s.uuid ===uuid)
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

    async subscribeSelected(characteristics:string[], callback: (characteristicUuid: string, data: Buffer, isNotify?:boolean) => void): Promise<boolean> {

        const uuids = characteristics!=null ? characteristics.map( c=>beautifyUUID(c)).join('|') : 'none'

        this.logEvent({message:'peripheral subscribe selected', uuids})

        if (!this.discoveredServiceUUIds) {
            try {
                await this.discoverServices()
            }
            catch {}
        }

        
        try {
            if (Object.keys(this.characteristics).length===0) {
                await this.discoverAllCharacteristics();
            }
            const retry = []
    
            for (const element of characteristics) {            
                const c = this.getRawCharacteristic(element)
                if (c?.properties.includes('notify') || c?.properties.includes('indicate')) {
                    const success = await this.subscribe(c.uuid, callback)
                    if (!success)
                        retry.push(c)
                }
                else {
                    const uuid =  beautifyUUID(element)
                    if (c?.properties) {
                        this.logEvent({message:'cannot subscribe',uuid, reason:'invalid type', properties:c.properties.join('|')})
                    }
                    else {
                        this.logEvent({message:'cannot subscribe',uuid, reason:'not found'})
                    }
                }
            }
    
            for (const element of retry) {
                const c = element
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
            const {name,address} = this.getInfo()

            this.logEvent({message:'discover all characteristics',name,address})


            const res = await this.getPeripheral().discoverSomeServicesAndCharacteristicsAsync([],[])                

            const found:string[] = []
            const uuids:string[] = []
            
            res.characteristics.forEach(c => {
                this.characteristics[beautifyUUID(c.uuid)] = c
                found.push(c.uuid)
                uuids.push(beautifyUUID(c.uuid))
            });

            this.logEvent({message:'discover all characteristics result',name,address,uuids:uuids.join('|')})


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
        this.logEvent({message:'peripheral subscribe all'})

        if (!this.discoveredServiceUUIds) {
            try {
                await this.discoverServices()
            }
            catch {}
        }
        
        const characteristics = await this.discoverAllCharacteristics()
        const success = await this.subscribeSelected(characteristics,callback)
        return success
    }

    async unsubscribeAll(connectionLost:boolean=false):Promise<void> {
        this.logEvent({message:'peripheral unsubscribe all', connectionLost})
        if (connectionLost) {
            this.subscribed = []
            return
        }

        const promises = []
        this.subscribed.forEach(d => {
            promises.push(this.unsubscribe(d.uuid))
        })

        await Promise.allSettled(promises)
    }

    async read(characteristicUUID: string): Promise<Buffer> {
        if (this.disconnecting || !this.connected)
            return Buffer.from([])

        let c = this.characteristics[beautifyUUID(characteristicUUID)]
        if (!c) {
            await this.discoverAllCharacteristics()
            c = this.characteristics[beautifyUUID(characteristicUUID)]
            if (!c) {
                return Promise.reject( new Error('characteristic not found: '+characteristicUUID))
            }

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

    async write(characteristicUUID: string, data: Buffer, options?: BleWriteProps): Promise<Buffer> {
        if (this.disconnecting || !this.connected)
            return Buffer.from([])

        const uuid = beautifyUUID(characteristicUUID)
        let c = this.characteristics[uuid]
        if (!c) {
            await this.discoverAllCharacteristics()
            c = this.characteristics[beautifyUUID(characteristicUUID)]
            if (!c) {
                return Promise.reject( new Error('characteristic not found: '+characteristicUUID))
            }
        }


        return new Promise( (resolve,reject) => {

            const write = () => {
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

            }

            if ( !options?.withoutResponse ) {
                this.subscribe(characteristicUUID,null).then( success => {
                    write()
                })
            }
            else {
                write() 
            }

        })

    }

    protected async queryRawCharacteristic(uuid:string):Promise<BleRawCharacteristic> {
        const characteristicUUID = beautifyUUID(uuid)
        let c =  this.characteristics[beautifyUUID(uuid)]       
        if (c)
            return c

        const res = await this.getPeripheral().discoverSomeServicesAndCharacteristicsAsync([],[characteristicUUID])                
        if (res.characteristics.length===0) {
            return
        }

        c = res.characteristics.find( dc => beautifyUUID(dc.uuid) === beautifyUUID(characteristicUUID))
        if (c) {
            this.characteristics[characteristicUUID] = c
        }
        return c        
    }

    protected getRawCharacteristic(uuid:string, query:boolean=false):BleRawCharacteristic {
        return   this.characteristics[beautifyUUID(uuid)]       
    }

    logEvent( event) {
        event.peripheral = this.announcement?.name
        this.ble.logEvent(event)
    }


}