import BleAdapter from "./base/adapter";
import { BleDeviceSettings, BleProtocol, TBleSensor } from "./types";
import { DeviceProperties } from "../types";
import { mapLegacyProfile } from "./utils";
import { BleDeviceData } from "./base/types";

export interface BleAdapterInfo<T extends TBleSensor> {
    protocol: BleProtocol,
    Adapter: typeof BleAdapter<BleDeviceData,T>
    Comm: typeof TBleSensor    
}


export default class BleAdapterFactory<T extends TBleSensor> {
    static readonly _instances:Record<string, BleAdapterFactory<any>> = {};

    implementations: BleAdapterInfo<any>[]
    instances: Array<BleAdapter<BleDeviceData,T>>

    static getInstance(transport:string): BleAdapterFactory<any> {
        if (!BleAdapterFactory._instances[transport])
            BleAdapterFactory._instances[transport] = new BleAdapterFactory(transport) ;
        return BleAdapterFactory._instances[transport];
    }

    constructor(public transport:string) {
        this.implementations = []
        this.instances = []
    }

    getAdapterInfo(protocol:BleProtocol):BleAdapterInfo<T> {
        return  this.implementations.find(a=>a.protocol===protocol) 
    } 
    getAll():BleAdapterInfo<T>[] {
        return this.implementations
    }

    createInstance(settings:BleDeviceSettings,props?:DeviceProperties):BleAdapter<BleDeviceData,T> {
        let {profile, protocol} = settings;

        const adapterSettings = {...settings}

        if (profile) { // legacy settings 
            try {
                const mapping = mapLegacyProfile(profile)
                protocol = adapterSettings.protocol = mapping.protocol
                delete adapterSettings.profile
            }
            catch {

                // incorrect legacy settings
                delete settings.profile
               
            }
        }


        const existing = this.find(adapterSettings)
        if (existing) {
            existing.setProperties(props)
            return existing

        }

        const info = this.getAdapterInfo(protocol)
        console.log('~~~~ INFO:',info)

        if (!info?.Adapter)
            return

        const adapter= new info.Adapter(adapterSettings,props)      
        this.instances.push(adapter)  
        return adapter
    }

    removeInstance( query:{settings?:BleDeviceSettings, adapter?:BleAdapter<BleDeviceData,T>}):void {
        let idx=-1;

        if (query.settings) {   
            idx =  this.instances.findIndex( a=>a.isEqual(query.settings))
        }
        else if (query.adapter) {
            idx =  this.instances.findIndex( a=>a.isEqual(query.adapter.getSettings()))
        }
        if (idx!==-1) 
            this.instances.splice(idx)
    }

    find(settings?:BleDeviceSettings) {
        return this.instances.find( a=>a.isEqual(settings))
    }


    register( protocol: BleProtocol, Adapter: typeof BleAdapter<BleDeviceData,T>,Comm: typeof TBleSensor)  {       
        const info = Object.assign({},{protocol, Adapter,Comm})
        const existing = this.implementations.findIndex( a => a.protocol===protocol) 

        if (existing!==-1)
            this.implementations[existing]= info;
        else    
            this.implementations.push(info)
    }

    getAllInstances(): Array<BleAdapter<BleDeviceData,T>> {
        return this.instances
    }


    getAllSupportedComms(): (typeof TBleSensor)[] {
        const supported = this.getAll()
        return supported.map( info => info.Comm)
    }
    getAllSupportedAdapters(): Array<(typeof BleAdapter<BleDeviceData,T>)> {
        const supported = this.getAll()
        return supported.map( info => info.Adapter)
    }
    
    getAllSupportedServices():string[] {
        const supported = this.getAll()
        const res = ['180d','1818','1826','6e40fec1'];
 
        /*
        if (supported && supported.length>0) {
            supported.forEach( info => {
                if (info?.Comm?.services) {
                    info.Comm.services.forEach( s => {
                        if ( !res.includes(s))
                            res.push(s)
                    })
                }
    
            })
        }
        */
    
        return res;
    }


    
    

}