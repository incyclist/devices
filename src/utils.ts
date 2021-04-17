export const sleep = (x) => { 
    return new Promise( ok => { setTimeout( ()=>{ok()}, x)})
};

export function runWithRetries( fn, maxRetries, timeBetween) {

    return new Promise( (resolve,reject)=> {
        let retries = 0;
        let tLastFailure = undefined;
        let busy = false;
        const iv = setInterval ( async ()=> {
            const tNow =Date.now();

            /* istanbul ignore next */
            if(busy)
                return;
            if ( tLastFailure===undefined || tNow-tLastFailure>timeBetween) {
                try {
                    busy = true;
                    const data = await fn();
                    busy = false;
                    clearInterval(iv)
                    return resolve( data )
                }
                catch( err) {
                    tLastFailure = Date.now();
                    busy = false;
                    retries++;
                    if ( retries>maxRetries) {
                        clearInterval(iv)
                        return reject( err);    
                    }         
                }    
            }
        }, 50)
    })
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



export class Queue<T> {
    data: Array<T>;

    constructor( values? : Array<T>) {
        this.data = [];
        if (values)
            this.data = values;
    }

    size() {
        return this.data? this.data.length : 0;
    }

    clear() {
        this.data = [];
    }

    isEmpty() {
        return this.data===undefined || this.data.length===0;
    }

    dequeue(): T {
        const removed = this.data.splice(0,1)
        return removed[0];
    }

    enqueue(value: T) {
        this.data.push(value)
    }

}

