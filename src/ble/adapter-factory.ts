import BleAdapter from "./base/adapter";
import { BleDeviceSettings, BleProtocol } from "./types";
import { DeviceProperties } from "../types";
import { BleComms } from "./base/comms";
import { getDevicesFromServices } from "./base/comms-utils";
import { mapLegacyProfile } from "./utils";
import { BleDeviceData } from "./base/types";

export interface BleAdapterInfo {
    protocol: BleProtocol,
    Adapter: typeof BleAdapter<BleDeviceData,BleComms>
    Comm: typeof BleComms
}


export default class BleAdapterFactory {
    static _instance:BleAdapterFactory;

    implementations: BleAdapterInfo[]
    instances: Array<BleAdapter<BleDeviceData,BleComms>>

    static getInstance(): BleAdapterFactory {
        if (!BleAdapterFactory._instance)
            BleAdapterFactory._instance = new BleAdapterFactory() ;
        return BleAdapterFactory._instance;
    }

    constructor() {
        this.implementations = []
        this.instances = []
    }

    getAdapterInfo(protocol:BleProtocol):BleAdapterInfo {
        return  this.implementations.find(a=>a.protocol===protocol) 
    } 
    getAll():BleAdapterInfo[] {
        return this.implementations
    }

    createInstance(settings:BleDeviceSettings,props?:DeviceProperties):BleAdapter<BleDeviceData,BleComms> {
        let {profile, protocol} = settings;

        const adapterSettings = Object.assign( {}, settings)

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
        if (!info || !info.Adapter)
            return

        const adapter= new info.Adapter(adapterSettings,props)      
        this.instances.push(adapter)  
        return adapter
    }

    removeInstance( query:{settings?:BleDeviceSettings, adapter?:BleAdapter<BleDeviceData,BleComms>}):void {
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


    register( protocol: BleProtocol, Adapter: typeof BleAdapter<BleDeviceData,BleComms>,Comm: typeof BleComms)  {       
        const info = Object.assign({},{protocol, Adapter,Comm})
        const existing = this.implementations.findIndex( a => a.protocol===protocol) 

        if (existing!==-1)
            this.implementations[existing]= info;
        else    
            this.implementations.push(info)
    }

    getAllInstances(): Array<BleAdapter<BleDeviceData,BleComms>> {
        return this.instances
    }


    getAllSupportedComms(): (typeof BleComms)[] {
        const supported = BleAdapterFactory.getInstance().getAll()
        return supported.map( info => info.Comm)
    }
    getAllSupportedAdapters(): Array<(typeof BleAdapter<BleDeviceData,BleComms>)> {
        const supported = BleAdapterFactory.getInstance().getAll()
        return supported.map( info => info.Adapter)
    }
    
    getAllSupportedServices():string[] {
        const supported = BleAdapterFactory.getInstance().getAll()
        const res = [];
    
        if (supported && supported.length>0) {
            supported.forEach( info => {
                if (info && info.Comm && info.Comm.services) {
                    info.Comm.services.forEach( s => {
                        if ( !res.includes(s))
                            res.push(s)
                    })
                }
    
            })
        }
    
        return res;
    }


    
    getDeviceClasses (peripheral, props:{ protocol?: BleProtocol, services?: string[] } = {}): (typeof BleComms)[] {
        let DeviceClasses;
        const {protocol,services=peripheral.advertisement.serviceUuids}  = props;
    
    
        // find matching Classes in the set of all registered Device Classes
        const classes = this.getAllSupportedComms()
        DeviceClasses = getDevicesFromServices( classes, services) 
    
        if (protocol && DeviceClasses && DeviceClasses.length>0) {
            DeviceClasses = DeviceClasses.filter( (C: typeof BleComms)  => {                
                const device = new C({peripheral});
                if (device.getProtocol()!==protocol) 
                    return false;
                return true;
            })
        }
        return DeviceClasses
    }
    

}