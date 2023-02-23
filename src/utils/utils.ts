export const sleep = (ms) => { 
    return new Promise( resolve => setTimeout(resolve, ms))
};
export const resolveNextTick = () => {
    return new Promise<void>(resolve => process.nextTick(() => resolve()))
}

export function runWithRetries( fn, maxRetries, timeBetween) {

    return new Promise( (resolve,reject)=> {
        let retries = 0;
        let tLastFailure = undefined;
        let busy = false;
        let iv = setInterval ( async ()=> {
            const tNow =Date.now();

            /* istanbul ignore next */
            if(busy) {
                return;
            }

            if ( tLastFailure===undefined || tNow-tLastFailure>timeBetween) {
                try {
                    busy = true;
                    const data = await fn();
                    clearInterval(iv)
                    iv = undefined
                    
                    busy = false;

                    return resolve( data )
                }
                catch( err) {
                    tLastFailure = Date.now();
                    retries++;
                    if ( retries>=maxRetries) {
                        clearInterval(iv)
                        iv = undefined
                        
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

export function floatVal(d?:number|string):number {

    if (d===undefined)
        return;
    if (typeof d==='number')
        return d
    const res = parseFloat(d)
    return isNaN(res) ? undefined : res;
}
export function intVal(d?:number|string):number {
    if (d===undefined)
        return;
    if (typeof d==='number')
        return Math.floor(d)
    const res = parseInt(d)
    return isNaN(res) ? undefined : res;
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
