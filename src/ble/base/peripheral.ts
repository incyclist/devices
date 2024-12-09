import { BleCharacteristic, BlePeripheralAnnouncement, BlePeripheralInfo, BleRawCharacteristic, BleRawPeripheral, BleService, BleWriteProps, IBlePeripheral } from "../types";

export class BlePeripheral implements IBlePeripheral {

    protected connected = false
    protected characteristics: Record<string, BleRawCharacteristic> = {}
    protected onDisconnectHandler?: () => void
    constructor(protected announcement:BlePeripheralAnnouncement) { 

    }
    get services(): BleService[] {
        return this.announcement.peripheral.services
    }

    protected getPeripheral():BleRawPeripheral {
        return this.announcement.peripheral
    }

    async connect(): Promise<boolean> {
        await this.getPeripheral().connectAsync()
        this.connected = true;
        return true
    }
    async disconnect(): Promise<boolean> {
        await this.getPeripheral().disconnectAsync()
        this.connected = false;
        return true
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
            const services = await this.getPeripheral().discoverServicesAsync([])
            return services.map(s=>s.uuid)    
        }
        else {
            const res = await this.getPeripheral().discoverSomeServicesAndCharacteristicsAsync([],[])                
            return res.services.map(s=>s.uuid)
        }
    }

    async discoverCharacteristics(serviceUUID: string): Promise<BleCharacteristic[]> {
        const res = await this.getPeripheral().discoverSomeServicesAndCharacteristicsAsync([serviceUUID],[])                
        res.characteristics.forEach( c => this.characteristics[c.uuid] = c)

        return res.characteristics.map( c => {
            const  {uuid,properties,name,_serviceUuid} = c
            return {uuid,properties,name,_serviceUuid} 
        })
    }


    subscribe(characteristicUUID: string, callback: (characteristicUuid: string, data: Buffer) => void): Promise<boolean> {
        const c = this.characteristics[characteristicUUID]
        if (!c) {
            return Promise.resolve(false)
        }
        return new Promise( (resolve,reject) => {
            c.subscribe( (err:Error|undefined) => {
                if (err) {
                    resolve(false)
                }
                else {
                    resolve(true)
                }
            })
        })
        
    }
    unsubscribe(characteristicUUID: string): Promise<boolean> {
        const c = this.characteristics[characteristicUUID]
        if (!c) {
            return Promise.resolve(false)
        }
        return new Promise( (resolve,reject) => {
            c.unsubscribe( (err:Error|undefined) => {
                if (err) {
                    resolve(false)
                }
                else {
                    resolve(true)
                }
            })
        })

        
    }

    async subscribeAll(callback: (characteristicUuid: string, data: Buffer) => void): Promise<boolean> {
        const res = await this.getPeripheral().discoverSomeServicesAndCharacteristicsAsync([],[])                

        let promises = []
        res.characteristics.forEach( c => {
            this.characteristics[c.uuid] = c
            promises.push(this.subscribe(c.uuid, callback))
        })

        await  Promise.allSettled(promises)
        return true


    }

    read(characteristicUUID: string): Promise<Buffer> {
        const c = this.characteristics[characteristicUUID]
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
        const c = this.characteristics[characteristicUUID]
        if (!c) {
            return Promise.reject( new Error('characteristic not found'))
        }
        return new Promise( (resolve,reject) => {
            c.write( data, options?.withoutResponse, (err:Error|undefined) => {
                if (err) {
                    reject(err)
                }
                else {

                    if (options?.withoutResponse) {
                        resolve(Buffer.from([]))
                    }
                    else {
                        this.subscribe(characteristicUUID, (uuid, response) => {
                            resolve(response)
                            this.unsubscribe(characteristicUUID)
                        })   
                    }
                }
            })
        })

    }

}