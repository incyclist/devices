import { Route } from "../../types/route";
import { Gender, User } from "../../types/user";
import { DEFAULT_AGE, DEFAULT_USER_WEIGHT } from "../classic/utils";
import FileTime from 'win32filetime'

const sum = (arr) => arr.reduce( (a,b) => a+b,0);

export function bin2esc (arr) {
    if ( arr===undefined) {
        return;
    }

    const res = []
    arr.forEach( v => {
        switch (v) {
            case 0x12: res.push(0x22); res.push(0x12); break; 
            case 0x22: res.push(0x22); res.push(0x22); break; 
            case 0x01: res.push(0x22); res.push(0x11); break; 
            case 0x17: res.push(0x22); res.push(0x27); break; 
            case 0x06: res.push(0x22); res.push(0x16); break; 
            case 0x15: res.push(0x22); res.push(0x25); break; 
            default:
                res.push(v);

        }
    })
    return res
}

export function esc2bin(arr) {
    if ( arr===undefined) {
        return;
    }

    const res = []
    let escaped = false;
    arr.forEach( (v,idx) => {
        
        if (escaped) {
            escaped = false;
            switch (v) {
                case 0x11: res.push(0x1); return;
                case 0x27: res.push(0x17); return;
                case 0x16: res.push(0x6); return;
                case 0x25: res.push(0x15); return;
                case 0x12: res.push(0x12); return;
                case 0x22: res.push(0x22); return;
                default: res.push(v);
            }                
            return;
        }

        if ( v===0x22) {
            escaped = true;
        }
        else {
            res.push(v)
        }

        
    })
    return res

}


export function checkSum( cmdArr, payload) {

    const total = sum(cmdArr)+sum(payload);
    const checkSumVal = total % 100;
    let checkSumStr = checkSumVal.toString();
    while (checkSumStr.length<2) checkSumStr = '0'+checkSumStr;
    return checkSumStr;
}

export function buildMessage(command,payload?) {

    const cmdArr = getAsciiArrayFromStr(command);

    let data = payload || [];

    if ( typeof(payload) === 'number') 
        data = [payload]
    if ( typeof(payload) === 'string') 
        data = getAsciiArrayFromStr(payload)
    
    const checkSumVals = getAsciiArrayFromStr( checkSum( cmdArr, data) );

    const message = [];
    message.push(0x01);
    message.push(...cmdArr);
    if ( data.length>0)
        message.push(...data);
    message.push(...checkSumVals);
    message.push(0x17);
    return message;
}

export function getMessageData(command) {
    const res = [...command];
    res.splice(0,4); // remove SOH and header
    res.splice(-3,3);   // remove checksum and ETB
    return res;
}



export function hexstr(arr,start?,len?) {

    const isArr =  Array.isArray(arr) || arr instanceof Uint8Array;
    if(!arr) return '';

    var str = "";
    if (start===undefined) 
        start = 0;
    if ( len===undefined || (start+len>arr.length) ) {
        len = arr.length-start;
    }
    if(len<0) return '';

    var j=start;
    for (var i = 0; i< len; i ++) {
        const c = isArr ? arr[j++] : ascii(arr.charAt(j++))
        var hex = Math.abs(c).toString(16);
        if (hex.length<2) hex = '0'+hex;
        if ( i!==0 ) str+=" ";
        
        str+=hex;
    }
	return str;
}

export function getHex (i) { return ('00' + i.toString(16)).slice(-2) }

export function append (cmd, arr) { cmd.push(...arr)}



export function ascii(c) {
    if (c===undefined || c===null)
        return;

    return c.charCodeAt(0);
}

export function charArrayToString( arr) {
    if ( arr===undefined || arr==null) return undefined;

    let str = ''
    arr.forEach(c => str+=c);
    return str;
}

export function asciiArrayToString( arr) {
    if ( arr===undefined || arr==null) return undefined;

    let str = ''
    arr.forEach(c => str+= String.fromCharCode(c));
    return str;
}

export function getAsciiArrayFromStr (str) { 
    if (str===undefined || str===null)
        return undefined;
    
    const n = str.length;
    let result = [];
    for (let i=0;i<n;i++) {
        result.push( str.charCodeAt(i) );
    }
    return result;
}


export function Float32ToHex (float32)  {
    var view = new DataView(new ArrayBuffer(4))
    view.setFloat32(0, float32);
    return Array.apply(null, { length: 4 }).map((_, i) => getHex(view.getUint8(i))).join('');
}

export function Float32ToIntArray (float32)  {
    var view = new DataView(new ArrayBuffer(4))
    view.setFloat32(0, float32);
    var arr = [];
  	for ( let i=0;i<4;i++) {
      arr.push( view.getUint8(i))
    }
    return arr;
}


export function Int16ToIntArray (int16)  {
    var view = new DataView(new ArrayBuffer(2))
    view.setInt16(0, int16);
    var arr = [];
  	for ( let i=0;i<2;i++) {
      arr.push( view.getUint8(i))
    }
    return arr;
}

export function Int32ToIntArray (int32)  {
    var view = new DataView(new ArrayBuffer(4))
    view.setInt32(0, int32);
    var arr = [];
  	for ( let i=0;i<4;i++) {
      arr.push( view.getUint8(i))
    }
    return arr;
}


export enum ReservedCommands {
    RESULT_RESET = 0,
    RESULT_GET = 1,
    NETRACE_START = 2,
    NETRACE_STOP = 3,
    NETRACE_USERNAME = 4,
    NETRACE_USERDATA = 5,
    PERSON_GET = 6,
    PERSON_SET = 7,
    PROGRAM_LIST_BEGIN = 8,
    PROGRAM_LIST_NEW_PROGRAM = 9,
    PROGRAM_LIST_CONTINUE_PROGRAM = 10,
    PROGRAM_LIST_END = 11,
    PROGRAM_LIST_START = 12,
    RELAX_START = 12,
    RELAX_STOP = 14,
    RELAX_GET_DATA = 0xF,
    KEY_PRESSED = 0x10,
    PROGRAM_CONTROL = 0x11
}

export enum BikeType {
    ALLROUND = 0,
    RACE = 1,
    MOUNTAIN =2
}

export function getBikeType( bikeTypeStr?:string): BikeType {
    if (bikeTypeStr===undefined || bikeTypeStr===null)
        return BikeType.RACE;

    if (bikeTypeStr.toLowerCase()==='mountain') 
        return BikeType.MOUNTAIN;
    
    return BikeType.RACE;
}

export function routeToEpp(route:Route, date?:Date): Uint8Array {
    
    const buffer = Buffer.alloc( 376 + route.points.length*12 );

    const fileTime = FileTime.fromUnix( date? date: Date.now())
    
    let offset = 0;

    const name = route.name || ''
    const description = route.description || ''
    const minElevation = route.minElevation ? route.minElevation : 0;
    const maxElevation = route.maxElevation ? route.minElevation : Math.max ( ...route.points.map(p => p.elevation))
    const sampleRate = route.points.length!==0 ? Math.round(route.totalDistance/route.points.length) : 0;

    buffer.writeUInt32LE(fileTime.low,offset);offset+=4;
    buffer.writeUInt32LE(fileTime.high,offset); offset+=4;
    buffer.write(name ,offset, name.length, 'ascii'); offset +=64;
    buffer.write(description,offset, description.length, 'ascii'); offset +=256;

    buffer.writeInt32LE(0x10,offset);offset+=4;                                     // ProgramType = DISTANCE_HEIGHT=0x10
    buffer.writeInt32LE(0x0,offset);offset+=4;                                      // reserved
    buffer.writeInt32LE(minElevation,offset);offset+=4;                             // minElevation
    buffer.writeInt32LE(maxElevation,offset);offset+=4;                             // maxElevation
    buffer.writeInt32LE(route.points.length,offset);offset+=4;                      // points count
    buffer.writeInt32LE(sampleRate,offset);offset+=4;                               // sample rate
    buffer.writeInt32LE(0x01,offset);offset+=4;                                     // valid for ( BITs: 1: bike, 2: lyps, 4: run)
    buffer.writeInt32LE(0x0,offset);offset+=4;                                      // elevation start      // TODO: why 0 and not 2st elevation ??
    buffer.writeInt16LE(0x0,offset);offset+=2;                                      // power limit
    buffer.writeInt16LE(0x0,offset);offset+=2;                                      // heart rate limit
    buffer.writeInt32LE(0x0,offset);offset+=4;                                      // speed limit
    buffer.writeInt32LE(0x0,offset);offset+=4;                                      // reserved
    buffer.writeInt32LE(0x0,offset);offset+=4;                                      // reserved
    
    route.points.forEach(p => {
        buffer.writeUInt32LE(sampleRate,offset);offset+=4;                          // sample rate
        buffer.writeFloatLE(p.elevation,offset);offset+=4;                          // elevation          
        buffer.writeFloatLE(0,offset);offset+=4;                                    // reserved
    })

    return new Uint8Array(buffer);
}



export function parseTrainingData(payload) {
    
    const GS = 0x1D

    const speedVals=['ok','too low','too high']
    const gearVal = (v) => v>0 ? v-1 : undefined;

    //const strVals = payload.reduce ( (str,c) => str + (c==0x1d ? '#' :String.fromCharCode(c) ),'')
    const vals = payload.split( String.fromCharCode(GS) );
    
    const data = {
        time: parseInt(vals[0]),
        heartrate: parseInt(vals[1]),
        speed: parseFloat(vals[2]) *3.6,
        slope: parseFloat(vals[3]),
        distanceInternal: parseInt(vals[4]),
        cadence: parseFloat(vals[5]),
        power: parseInt(vals[6]),
        physEnergy: parseFloat(vals[7]),
        realEnergy: parseFloat(vals[8]),
        torque: parseFloat(vals[9]),
        gear:  gearVal(parseInt(vals[10])),
        deviceState: parseInt(vals[11]),
        speedStatus: speedVals[parseInt(vals[12])],
    }

    return data;
 
}

	// Data Structure:
    // ---------------------------------------------------------
	// PMWTL_PERSONAL_DATA					136 == 0x88
	// TMWTL_PERSONAL_DATA
	// 
	// LIMIT_COMPARE_STRUCT limits			112

    	/// LIMIT_COMPARE_STRUCT				112
        /// 
        /// LMM_STRUCT limit					56
        /// LMM_STRUCT limitCompare				56

            /// LMM_STRUCT							56
            /// 
            /// LIMIT_STRUCT min					28
            /// LIMIT_STRUCT max					28


                /// LIMIT_STRUCT						28
                /// 
                /// TFLOAT speed						4
                /// TFLOAT slope;						4
                /// TFLOAT distance;					4
                /// TFLOAT nm;							4
                /// TUINT16 height;						2
                /// TUINT16 kJoule;						2
                /// TUINT16 watt;						2
                /// TUINT16 forbiddenTime;				2
                /// TUINT8 pulse;						1
                /// TUINT8 time;						1
                /// TUINT8 rpm;							1
                /// TUINT8 unused1;						1
                /// 
                /// Hint: All can be disabled with value 0, except for slope, which needs to be disabled with -100        

	// 
	// TSINT32 sex							4	// 1 = male, 2 = female
	// TSINT32 age							4   // 00
	// TSINT32 height						4   // 181
	// TFLOAT weight						4   // float: 00 00 b1 42
	// TFLOAT realisticKJFactor			    4   // 0
	// TUINT32 cockpitPerson				4   // 0

export function getPersonData(user: User) {

    const buffer =Buffer.alloc(136);
    let offset = 0;

    // write limit compare struct
    for (let i=0;i<4;i++) {
        buffer.writeInt32LE(0,offset); offset+=4;           // speed = 0;
        buffer.writeFloatLE(-100,offset); offset+=4;        // slope = -100;
        buffer.writeFloatLE(0,offset); offset+=4;           // distance = 0;
        buffer.writeFloatLE(0,offset); offset+=4;           // nm = 0;
        buffer.writeUInt16LE(0,offset); offset+=2;          // height = 0;
        buffer.writeUInt16LE(0,offset); offset+=2;          // kJoule = 0;
        buffer.writeUInt16LE(0,offset); offset+=2;          // watt = 0;
        buffer.writeUInt16LE(0,offset); offset+=2;          // forbiddenTime = 0;
        buffer.writeUInt8(0,offset); offset+=1;             // pulse = 0;
        buffer.writeUInt8(0,offset); offset+=1;             // time = 0;
        buffer.writeUInt8(0,offset); offset+=1;             // rpm = 0;
        buffer.writeUInt8(0,offset); offset+=1;             // unused1 = 0;
    }

    buffer.writeInt32LE( 1   /*user.sex=== Gender.FEMALE ? 2: 1*/, offset );offset+=4;
    buffer.writeInt32LE( 1   /*user.age!==undefined ? user.age :  1*/, offset);offset+=4;
    buffer.writeInt32LE( 175 /*user.length!==undefined ? user.length :  175*/, offset);offset+=4;
    buffer.writeFloatLE( 70  /*user.weight!==undefined ? user.weight :  70*/, offset);offset+=4;
    buffer.writeFloatLE( 0,offset);offset+=4;               // realisticKJFactor = 0
    buffer.writeUInt32LE( 1,offset);offset+=4;              // cockpitPerson = 1;
    
    return buffer;

}
