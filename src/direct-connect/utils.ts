import { BleProperty } from "../ble/types"

export const parseUUID = (str:string):string => {
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

    const uuid = parseUUID(str)
    
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
