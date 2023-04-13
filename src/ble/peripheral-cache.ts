import BleAdapter from "./base/adapter";
import BlePeripheralConnector from "./ble-peripheral";
import { BleCharacteristic, BlePeripheral } from "./types";
import { getPeripheralInfo } from "./utils";

export interface PeripheralState {
    isLoading: boolean;
    isConfigured: boolean
    isInterrupted: boolean;
}

export interface PeripheralCacheItem {
    address: string,
    name?:string,
    id?:string,
    ts: number, 
    peripheral: BlePeripheral,
    state?: PeripheralState,
    characteristics?: BleCharacteristic []
    connector?:BlePeripheralConnector
}

export default class BlePeripheralCache {
    peripherals: PeripheralCacheItem[] = []

    findAdapter(adapter: BleAdapter):PeripheralCacheItem {
        return this.find( adapter.getSettings())
    }

    getConnector( peripheral:BlePeripheral):BlePeripheralConnector {
        if(!peripheral)
            return;

        const info = this.find({address:peripheral.address})

        if (!info) {
            const item = this.add({address:peripheral.address, ts:Date.now(), peripheral});
            return item.connector;
        }
        return info.connector;            
    }

    getPeripheral(query: { id?:string, address?:string, name?:string}):BlePeripheral {
        const info = this.find(query)
        return info ? info.peripheral : undefined;
    }

    handleStopScan() {
        const ongoing = this.peripherals.filter( i=> i.state && i.state.isLoading);
        if (ongoing)
            ongoing.forEach( i => {i.state.isInterrupted = true;})
    }



    find( query: { name?: string, id?:string, address?:string, peripheral?:BlePeripheral}):PeripheralCacheItem {
        const {peripheral} = query
        const {name,address,id} = peripheral ? peripheral : query
        if (!name && !address && !id)
            throw new Error('illegal query, one of <id>,<name>,<address> needs to be provided')
        if (address) 
            return this.peripherals.find( i=> i.address===address)
        else if (name)
            return this.peripherals.find( i=> i.name===name)
        else if (id)
            return this.peripherals.find( i=> i.id===id)

    }

    filter(services:string[]):PeripheralCacheItem[] {
        if (services.length===0) {
            return this.peripherals
        }

        return this.peripherals.filter( i=> {
            const announced = i.peripheral.services.map(s=>(s as any).uuid)
            const requested = services
            return  ( announced.find( s => requested.includes(s)))
        })
        
    }

    protected _findIndex( query: { name?: string, id?:string, address?:string}):number {
        const {name,address,id} = query
        if (!name && !address && !id)
            throw new Error('illegal query, one of <id>,<name>,<address> needs to be provided')
        if (address) 
            return this.peripherals.findIndex( i=> i.address===address)
        else if (name)
            return this.peripherals.findIndex( i=> i.name===name)
        else if (id)
            return this.peripherals.findIndex( i=> i.id===id)
    }

    add(item: PeripheralCacheItem):PeripheralCacheItem {
        const {address,name,id} = item;
        const {ts,peripheral,state,characteristics} = item;

        const cachedItem = this.find({address,name,id})
        if (cachedItem) {
            cachedItem.ts = ts;
            cachedItem.peripheral = peripheral
            if (state) 
                cachedItem.state = state
            if (characteristics) {
                cachedItem.characteristics = characteristics; 
                // TODO: check if we should merge
            }
            if (!cachedItem.connector) {
                cachedItem.connector = item.connector || new BlePeripheralConnector(cachedItem.peripheral)
            }
            return cachedItem
        }
        else {
            const newItem = Object.assign( {}, item)
            if (newItem.peripheral && !newItem.connector)
                newItem.connector = new BlePeripheralConnector(item.peripheral)
            this.peripherals.push(newItem)
            return newItem
        }
    }


    remove(query: PeripheralCacheItem|BlePeripheral):void { 
        const item =  query as PeripheralCacheItem;
        const isCacheItem  = item.peripheral !==undefined

        let cachedItemIdx;
        if (isCacheItem) {
            const {address,name,id} = item;            
            cachedItemIdx = this._findIndex({address,name,id})
        }
        else {
            const peripheral = query as BlePeripheral
            const {address} = peripheral;            
            cachedItemIdx = this._findIndex({address})
        }
        
        if (cachedItemIdx===-1)
            return;
        this.peripherals.splice(cachedItemIdx)
    }
    
}