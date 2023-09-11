import { LegacyProfile } from "../antv2/types";
import { BleCharacteristic, BlePeripheral, BleProtocol } from "./types";

type MappingRecord = {
    profile: LegacyProfile,
    protocol: BleProtocol,
}

export function mapLegacyProfile(profile:string):MappingRecord {
    switch (profile) {
        case 'Smart Trainer': return { profile:'Smart Trainer', protocol:'fm' }
        case 'Elite Smart Trainer': return { profile:'Smart Trainer', protocol:'elite' }
        case 'Elite SmartTrainer': return { profile:'Smart Trainer', protocol:'elite' }
        case 'Heartrate Monitor': return { profile:'Heartrate Monitor', protocol:'hr' }
        case 'Power Meter': return { profile:'Power Meter', protocol:'cp' }
        case 'Tacx Smart Trainer': return { profile:'Smart Trainer', protocol:'tacx' }
        case 'Tacx SmartTrainer': return { profile:'Smart Trainer', protocol:'tacx' }
        case 'Wahoo SmartTrainer': return { profile:'Smart Trainer', protocol:'wahoo' }
        case 'Wahoo Smart Trainer': return { profile:'Smart Trainer', protocol:'wahoo' }
    }
}

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

export function getPeripheralInfo(p: BlePeripheral) {
    const {id,name,address,advertisement,services} = p;
    if (advertisement) {
        return {id,name:advertisement.localName,address,services:advertisement.serviceUuids}
    }
    else {
        return {id,name,address,services}
    }
}

export function getCharachteristicsInfo(c:BleCharacteristic) {
    const {uuid,properties,name,_serviceUuid} = c;

    const nameStr= name ? ` (${name})` : ''
    const serviceStr = _serviceUuid ? `${_serviceUuid}:` : ''

    return `${serviceStr}${uuid}${nameStr} ${properties}`
}
