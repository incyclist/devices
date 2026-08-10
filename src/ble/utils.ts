import { EventLogger } from "gd-eventlog";
import { LegacyProfile } from "../antv2/types.js";
import { BleCharacteristic,  BleProperty,  BleProtocol, BleRawPeripheral } from "./types.js";

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
            const uuidNo = Number.parseInt('0x'+parts[0])
            return uuidNo.toString(16).toLowerCase()
        }
        return s;
    }
}

export function matches (uuid1:string,uuid2:string):boolean {

    return parseUUID(uuid1)===parseUUID(uuid2)

}

export function getPeripheralInfo(p: BleRawPeripheral) {
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




export const parseUUID = (str:string):string => {
    if (!str)
        return str

    const uuid = str.toUpperCase()

    if (str.startsWith('0x')) { 
        const hex = uuid.slice(2)
        if (hex.length===4) { // 16bit)
            return `0000${hex}00001000800000805F9B34FB`    
        }
        if (hex.length===8) { // 32bit)
            return `${hex}00001000800000805F9B34FB`    
        }
    }
    else if (uuid.length===4) {
        return `0000${uuid}00001000800000805F9B34FB`
    }
    else if (uuid.length===8) {
        return `${uuid}00001000800000805F9B34FB`
    }
    else if (uuid.length===32) {
        return uuid
    }
    else if (uuid.length===36) {
        return uuid.replace(/-/g,'')

    }
    throw new Error(`Invalid UUID: ${uuid}`)
}

export const beautifyUUID = (str:string, withX:boolean = false ):string => {   

    let uuid

    try {
        uuid = parseUUID(str)
    }
    catch (err) {
        const logger = new EventLogger('Incyclist')
        logger.logEvent({message:'beautifyUUID error',uuid:str, error:err.message})
        return str
    }
    
    const parts = [
        uuid.substring(0,8),
        uuid.substring(8,12),    
        uuid.substring(12,16),
        uuid.substring(16,20),
        uuid.substring(20),
    ]

    if (uuid.substring(8)==='00001000800000805F9B34FB') {
        let short
        if (parts[0].startsWith('0000')) {
            short = parts[0].substring(4)
        }
        else {
            short  = parts[0]
        }
        return withX ? `0x${short}` : short
    }
    
    return parts.join('-')

}

// FIXES_BACKLOG #26 (revised): vendors commonly mint a private 128-bit UUID "family" by generating
// one random base UUID and varying only its first 32 bits - the same base-UUID + assigned-number
// trick the Bluetooth SIG itself uses for its 16/32-bit UUIDs (against the shared Bluetooth Base
// UUID), just applied to a private base. A BLE advertisement can legitimately announce one member of
// that family while the device's real GATT service is a *different* member of the same family - e.g.
// Wahoo TICKR FIT advertises A0260001-0A7D-4AB3-97FA-F1500F9FEB8B but exposes A026EE01-... in GATT;
// Garmin HRM Pro+ advertises 6A4E3E10-667B-11E3-949A-0800200C9A66 but exposes 6A4E2401-... - same
// vendor base in each case, only the assigned-number prefix differs. Standard/SIG UUIDs all share the
// single common Bluetooth Base UUID, so this leniency only makes sense for genuinely custom
// (non-SIG-base) 128-bit UUIDs - two different SIG assigned numbers (e.g. 180D vs 1814) are still,
// correctly, different services.
export const isSameServiceFamily = (uuid1:string, uuid2:string):boolean => {
    const a = beautifyUUID(uuid1)
    const b = beautifyUUID(uuid2)

    if (a===b)
        return true

    const isCustom128 = (u:string) => u.length===36   // not collapsed to a short SIG form by beautifyUUID
    if (isCustom128(a) && isCustom128(b))
        return a.substring(9)===b.substring(9)   // compare the last 96 bits (vendor base) only

    return false
}

export const fullUUID = (str:string):string => {
    if (!str)
        return str

    const uuid = parseUUID(str)
    
    const parts = [
        uuid.substring(0,8),
        uuid.substring(8,12),    
        uuid.substring(12,16),
        uuid.substring(16,20),
        uuid.substring(20),
    ]  
    return parts.join('-')

}


export const propertyVal = (properties:BleProperty[]):number => {
    let res = 0

    if (properties.includes('read'))    res |= 0x01
    if (properties.includes('write'))   res |= 0x02
    if (properties.includes('notify'))  res |= 0x04

    return res
}


export const propertyFromVal = (val:number):BleProperty[] => {
    const res:BleProperty[] = []

    if (val & 0x01) res.push('read')
    if (val & 0x02) res.push('write')   
    if (val & 0x04) res.push('notify')

    return res
}

export const bit = (nr) => {
    return (1 << nr);
  }
  