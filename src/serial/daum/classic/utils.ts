import {DeviceType,IncyclistBikeData} from '../../../types'

export const DEFAULT_AGE         = 30;
export const DEFAULT_USER_WEIGHT = 75;
export const DEFAULT_BIKE_WEIGHT = 10;

export function getCockpit(c:number) {
    switch ( c) {        
        case 10: 
            return "Cardio";
        case 20: 
            return "Fitness";
        case 30: 
            return "Vita De Luxe";
        case 40: 
            return "8008";
        case 0x2A:
            return "8008 TRS"
        case 50: 
            return "8080";
        case 60: 
            return "Therapie";
        case 100: 
            return "8008 TRS Pro";
        case 160: 
            return "8008 TRS3";
        case 0x8D: // 141
            return "ergo_lyps Cardio Pro"
        default:
            return "Unknown";
    }
}

export function getSerialNo(arr:Uint8Array, start:number, length:number) {
  
    const buffer = Buffer.from(arr.subarray(start,start+length))
    return buffer.toString('hex')
}

export function getBikeType(type?:DeviceType):number {

    const DAUM_CLASSIC_BT_MOUNTAIN = 1
    const DAUM_CLASSIC_BT_RACE = 0
    //const DAUM_CLASSIC_BT_ALLROUND = 2

    if (type===undefined)
        return DAUM_CLASSIC_BT_RACE;

    switch (type) {
        case 'triathlon':
            return DAUM_CLASSIC_BT_RACE;
        case 'race':
            return DAUM_CLASSIC_BT_RACE;
        case 'mountain':
            return DAUM_CLASSIC_BT_MOUNTAIN;
    }
   
}



export function getGender(sex) {
    if (sex===undefined)
        return 2;
    switch (sex) {
        case "M":
            return 0; 
        case "F":
            return 1; 
        default:
            return 2;
    }
    
}

export function getLength( length?:number) {
    if (length===undefined || length===null)
        return 180; // average european

    const l = Math.round(length);
    return between(l,100,220)
}

export function getWeight(weight?:number) {
    if (weight===undefined || weight===null)
        return 80; // average european

    let m = Math.round(weight);
    return between(m,10,250)
}

export function parseRunData( data) {
    const bikeData = {} as IncyclistBikeData


    /*
    const pedalling = data[4];
    if (pedalling===0x40 || pedalling===0x41) {
        throw new Error('Invalid data');
    }
    */

    bikeData.isPedalling = (data[4]>0);
    bikeData.power  = data[5]*5;
    bikeData.pedalRpm = data[6];
    bikeData.speed = data[7];
    bikeData.heartrate = data[14];
    bikeData.distanceInternal = (data[9]*256+data[8])*100;
    bikeData.time = (data[11]*256+data[10]);
    bikeData.gear = data[16];

    // TODO: calories

    return bikeData
}

export function between(v:number, min:number, max:number) {
    if (v<min)
        return min;
    if (v>max)
        return max;
    return v;
}

export function buildSetSlopeCommand(bikeNo,slope) {
    const buffer = Buffer.from([0x55,bikeNo,0,0,0,0]);
    buffer.writeFloatLE(slope,2);
    const cmd = Array.from(buffer)
    
    return cmd;
}

