import AdapterFactory from "../../adapters";
import BleAdapterFactory from "../adapter-factory";
import { BleProtocol } from "../types";
import { matches, uuid } from "../utils";
import { BleComms } from "./comms";

export function  getBestDeviceMatch(DeviceClasses : (typeof BleComms)[]):typeof BleComms {
    if (!DeviceClasses||DeviceClasses.length===0)
        return;
    const details = DeviceClasses.map( c=> ( {name:c.prototype.constructor.name, priority:(c as any).detectionPriority||0,class:c } ))
    details.sort( (a,b) => b.priority-a.priority)
    
    return details[0].class
}



export function getDevicesFromServices(deviceTypes : (typeof BleComms)[],services :string | string[]) : (typeof BleComms)[] {
    if (!deviceTypes || !Array.isArray(deviceTypes) || deviceTypes.length === 0) {
        return []
    }

    const get = (deviceTypes: (typeof BleComms)[], fnCompare: (s:string)=>boolean ) => {
        const types =  deviceTypes.filter( DeviceType  => { 
            const C = DeviceType as any

            let found = false;
            if (C.services)
                found = C.services.find( (s:string) => fnCompare(s) )

            return found;
        })    
        return types;

    }
    if ( typeof services === 'string') { 
        return get(deviceTypes, (s)=> matches(s,services) )
    }
    if ( Array.isArray(services)) {
        const sids = services.map(uuid);
        return get(deviceTypes, s => { 
            const res = sids.find( (service)=> matches(s,service)) 
            return res!==undefined;
        })
    }
    return []   
}




export function getServicesFromDeviceTypes(deviceTypes:(typeof BleComms)[]): string[] {
    let services = [] as string[]
    try {
        if (!deviceTypes || !Array.isArray(deviceTypes) || deviceTypes.length === 0) {
            return []
        }
        
        deviceTypes.forEach( DeviceType => {
            if (DeviceType.services) {
                const dtServices = DeviceType.services;
                dtServices.forEach( s => {
                    if ( !services.find( s2 => s2 === s)) 
                        services.push(s)
                })
            }
        })    
    }
    catch( err) {console.log(err)}
    return services;
}

export function getServicesFromProtocols( protocols: BleProtocol[]) {
    const services:string[] = []
    const comms = BleAdapterFactory.getInstance().getAllSupportedComms()    
    comms
      .filter((C: typeof BleComms)=> protocols.find( p => p===C.protocol)!==undefined )
      .forEach((C: typeof BleComms) => {        
        C.services.forEach( s => {
            if ( !services.find( s2 => s2 === s)) 
                services.push(s)
        })
      })
    return services;
}

export function getServicesFromDevice(device: BleComms): string[] {
    if (!device ) 
        return []

    const services = [] as string[]
    const dServices = device.getServiceUUids();
    dServices.forEach( s => {
        if ( !services.find( s2 => s2 === s)) 
            services.push(s)
    })

    return services;             
}


