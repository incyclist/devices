export function getCockpit( c) {
    switch ( c) {        
        case 10: 
            return "Cardio";
        case 20: 
            return "Fitness";
        case 30: 
            return "Vita De Luxe";
        case 40: 
            return "8008";
        case 50: 
            return "8080";
        case 60: 
            return "Therapie";
        default:
            return "Unknown";
    }
}

export function getBikeType( type) {
    if (type===undefined)
        return 0;

    switch (type) {
        case "triathlon":
            return 0;
        case "race":
            return 0;
        case "mountain":
            return 1;
        default:
            return 1;
    }
    
    // TODO: define possible values and parse (should be aligned with ANT* spec)
}


export function getAge(birthday) { // birthday is a date
    if (birthday===undefined) {
        return 30;
    }

    try {
        const bd = new Date(birthday);
        const ageDifMs = Date.now() - bd.getTime();
        var ageDate = new Date(ageDifMs); // miliseconds from epoch
        return Math.abs(ageDate.getUTCFullYear() - 1970);    
    } 
    catch (error) {
        return 30;
    }
}

export function getGender(sex) {
    if (sex===undefined)
        return 2;
    switch (sex) {
        case "M":
            return 1; 
        case "F":
            return 1; 
        default:
            return 2;
    }
    
}

export function getLength( length) {
    if (length===undefined || length===null)
        return 180; // average european

    let l = Math.round(length);

    if (l<100)
        return 100;
    if (l>220)
        return 220;

    return l;
}

export function getWeight(weight?) {
    if (weight===undefined || weight===null)
        return 80; // average european

    let m = Math.round(weight);
    if (isNaN(m))
        return 80;

    if (m<10)
        return 10;
    if (m>250)
        return 250;

    return m;
}

export function parseRunData( data) {
    const bikeData = {} as any
    bikeData.isPedalling = (data[4]>0);
    bikeData.power  = data[5]*5;
    bikeData.cadence = data[6];
    bikeData.speed = data[7];
    bikeData.heartrate = data[14];
    bikeData.distance = (data[9]*256+data[8])/10;
    bikeData.distanceInternal = (data[9]*256+data[8])*100;
    bikeData.time = (data[11]*256+data[10]);
    bikeData.gear = data[16];
    return bikeData
}


export function buildError ( status,err) {
    const message = err && err.message ? err.message: err;
    const error = new Error( message) as any;
    error.status = status;
    return error;
}

export function hexstr(arr,start?,len?) {
    var str = "";
    if (start===undefined) 
        start = 0;
    if ( len===undefined) {
        len = arr.length;
    }
    if (len-start>arr.length) {
        len = arr.length-start;
    }

    var j=start;
    for (var i = 0; i< len; i ++) {
        var hex = Math.abs( arr[j++]).toString(16);
        if ( i!==0 ) str+=" ";
        str+=hex;
    }
	return str;
}


export function Float32ToHex (float32)  {
    function getHex (i) { return ('00' + i.toString(16)).slice(-2) }
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
