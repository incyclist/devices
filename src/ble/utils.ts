import { BleComms } from "./ble-comms";

export function uuid (s:string):string {
    //console.log(s)
    if (s) {
        if (s.includes('-')) {
            const parts = s.split('-')
            const uuidNo = parseInt('0x'+parts[0])
            return uuidNo.toString(16).toLowerCase()
        }
        return s;
    }
}

export function matches (uuid1:string,uuid2:string):boolean {
    const ul1 = uuid1.toLowerCase()
    const ul2 = uuid2.toLowerCase()

    if (uuid(ul1)===uuid(ul2))
        return true;
 
    if (ul1.length<ul2.length && ul2.startsWith(ul1))
        return true
    if (ul1.length>ul2.length && ul1.startsWith(ul2))
        return true

    return false;

}

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


