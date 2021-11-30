export const sleep = (ms) => { 
    return new Promise( resolve => setTimeout(resolve, ms))
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
                    retries++;
                    if ( retries>=maxRetries) {
                        clearInterval(iv)
                        busy = false;
                        return reject( err);    
                    }         
                    else {
                        busy = false;
                    }
                }    
            }
        }, 50)
    })
}

export function hexstr(arr,start?,len?) {
    let str = "";

    const startIdx = start || 0;
    const length = len || arr.length;
    let endIdx = startIdx+length;
    if (endIdx>=arr.length) {
        endIdx = arr.length;
    }

    let added = 0;
    for (var i = startIdx; i< endIdx; i ++) {
        const hex = Math.abs( arr[i]).toString(16).toUpperCase();
        if ( added!==0 ) str+=' ';
        str+=hex;
        added++
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

