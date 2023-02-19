import { DeviceProperties } from "../types/device";
import { BleComms } from "./ble-comms";
import BleAdapter from "./adapter";
import { getDevicesFromServices } from "./utils";
import { BleDeviceSettings } from "./types";

export interface BleAdapterInfo {
    protocol: string,
    profile: string,
    Adapter: typeof BleAdapter
    Comm: typeof BleComms
}

export function mapLegacyProfile(profile) {
    switch (profile) {
        case 'Smart Trainer': return { profile:'Smart Trainer', protocol:'fm' }
        case 'Elite Smart Trainer': return { profile:'Smart Trainer', protocol:'elite' }
        case 'Heartrate Monitor': return { profile:'Heartrate Monitor', protocol:'hr' }
        case 'Power Meter': return { profile:'Power Meter', protocol:'cp' }
        case 'Tacx Smart Trainer': return { profile:'Smart Trainer', protocol:'tacx' }
        case 'Wahoo Smart Trainer': return { profile:'Smart Trainer', protocol:'wahoo' }
    }
    return {profile,protocol:'Ble'}    
}

export default class BleAdapterFactory {
    static _instance:BleAdapterFactory;

    adapters: BleAdapterInfo[]

    static getInstance(): BleAdapterFactory {
        if (!BleAdapterFactory._instance)
            BleAdapterFactory._instance = new BleAdapterFactory() ;
        return BleAdapterFactory._instance;
    }
    constructor() {
        this.adapters = []
    }

    getAdapter(protocol:string):BleAdapterInfo {
        return  this.adapters.find(a=>a.protocol===protocol) 
    } 
    getAllAdapters():BleAdapterInfo[] {
        return this.adapters
    }

    createInstance(settings:BleDeviceSettings,props?:DeviceProperties):BleAdapter {
        let {profile, protocol} = settings;

        const adapterSettings = Object.assign( {}, settings)

        if (protocol==='BLE') { // legacy settings 
            const mapping = mapLegacyProfile(profile)
            protocol = mapping.protocol
            profile = mapping.profile

            adapterSettings.protocol = protocol
            adapterSettings.profile = profile
        }

        const info = this.getAdapter(protocol)
        if (!info || !info.Adapter)
            return

        const adapter= new info.Adapter(adapterSettings,props)        
        return adapter
    }




    register( protocol: string, profile: string, Adapter: typeof BleAdapter,Comm: typeof BleComms)  {       
        const info = Object.assign({},{protocol, profile, Adapter,Comm})
        const existing = this.adapters.findIndex( a => a.protocol===protocol) 

        if (existing)
            this.adapters[existing]= info;
        else    
            this.adapters.push(info)
    }


    getAllSupportedDeviceTypes(): (typeof BleComms)[] {
        const supported = BleAdapterFactory.getInstance().getAllAdapters()
        return supported.map( info => info.Comm)
    }
    
    getAllSupportedServices():string[] {
        const supported = BleAdapterFactory.getInstance().getAllAdapters()
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
    
    getDeviceClasses (peripheral, props:{ deviceTypes?: (typeof BleComms)[], profile?: string, services?: string[] } = {}): (typeof BleComms)[] {
        let DeviceClasses;
        const {deviceTypes,profile,services=peripheral.advertisement.serviceUuids}  = props;
    
    
        if ((!deviceTypes ||deviceTypes.length===0)) {
            // find matching Classes in the set of all registered Device Classes
            const classes = this.getAllSupportedDeviceTypes()
            DeviceClasses = getDevicesFromServices( classes, services) 
        }
        else {                            
            // find matching Classes in the set of requested Device Classes
            DeviceClasses = getDevicesFromServices(deviceTypes, services) 
        }
    
        if (profile && DeviceClasses && DeviceClasses.length>0) {
            DeviceClasses = DeviceClasses.filter( C => {
                
                const device = new C({peripheral});
                if (device.getProfile()!==profile) 
                    return false;
                return true;
            })
        }
        return DeviceClasses
    }
    

}