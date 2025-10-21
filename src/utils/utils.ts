export const sleep = (ms) => { 
    return new Promise( resolve => setTimeout(resolve, ms))
};
export const resolveNextTick = () => {
    return new Promise<void>(resolve => process.nextTick(() => resolve()))
}

export async function runWithRetries( fn, maxRetries, timeBetween):Promise<any> {

    let iv 

    const res = await  new Promise( (resolve,reject)=> {
        let retries = 0;
        let tLastFailure = undefined;
        let busy = false;

        iv = setInterval ( async ()=> {
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

    if (iv) {
        clearInterval(iv)        
    }

    return res
}

export function floatVal(d?:number|string):number {

    if (d===undefined)
        return;
    if (typeof d==='number')
        return d
    const res = Number.parseFloat(d)
    return Number.isNaN(res) ? undefined : res;
}

export function intVal(d?:number|string):number {
    if (d===undefined)
        return;
    if (typeof d==='number')
        return Math.floor(d)
    const res = Number.parseInt(d)
    return Number.isNaN(res) ? undefined : res;
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
    for (let i = startIdx; i< endIdx; i ++) {
        const hex = Math.abs( arr[i]).toString(16).toUpperCase();
        if ( added!==0 ) str+=' ';
        str+=hex;
        added++
    }
	return str;
}

export function isTrue(value) {
    if (typeof(value) === 'string'){
        value = value.trim().toLowerCase();
    }
    switch(value){
        case true:
        case "true":
        case 1:
        case "1":
        case "on":
        case "yes":
            return true;
        default: 
            return false;
    }
}

export class Queue<T> {
    protected data: Array<T>;

    constructor( values? : Array<T>) {
        this.data = [];
        if (values)
            this.data = values;
    }

    size() {
        return this.data.length
    }

    clear() {
        this.data = [];
    }

    isEmpty() {
        return this.size()===0
    }

    dequeue(): T {
        const removed = this.data.splice(0,1)
        return removed[0];
    }

    enqueue(value: T) {
        this.data.push(value)
    }

}



export async function runWithTimeout( promise:Promise<any>, timeout:number) {
    return await doWaitWithTimeout( promise, timeout,true)
}

export async function waitWithTimeout( promise:Promise<any>, timeout:number, onTimeout?:()=>void) {
    return await doWaitWithTimeout( promise, timeout,false,onTimeout)
}


async function doWaitWithTimeout( promise:Promise<any>, timeout:number, throwError:boolean, onTimeout?:()=>void) {
    let to;
    let hasTimedOut=false;

    const toPromise =  (ms) => { 
        return new Promise<void>( (resolve,reject) => { to = setTimeout(()=>{
                
                hasTimedOut = true;
                /* istanbul ignore next */  // error in coverage report
                if (!onTimeout || throwError) {
                    reject(new Error('Timeout'))
                }
                else {
                    try {
                        onTimeout()
                        resolve()
                    }
                    catch(err) {
                        reject(err)
                    }
                }
    
        }, ms)})
    }


    let res;

    try {
        res = await Promise.race( [promise,toPromise(timeout)] )
    }
    catch (err) {
        /* istanbul ignore next */  // error in coverage report
        if (err.message==='Timeout' && hasTimedOut) {
            throw err
        }
        else {
            if (throwError) {
                clearTimeout(to)
                throw err
            }
        } 
    }

    clearTimeout(to)
    return res;        
}



