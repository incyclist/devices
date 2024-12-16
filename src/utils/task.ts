import EventEmitter from "events"
import { resolveNextTick } from "./utils"

export interface TaskState {
    result? : 'completed' |'timeout' | 'stopped' | 'error' | 'paused'
    error?:Error
    tsStart?:number
    tsTimeout?:number
    promise?: Promise<any>

}

export interface TaskProps<T,P> {
    timeout?:number
    state?: any
    name?:string
    errorOnTimeout?:boolean
    log?: (event:any) => void
    onDone?: (state:T) => P
}

interface InternalTaskState<P> {
    tsStart?:number
    tsTimeout?:number
    isRunning:boolean
    timeout?: NodeJS.Timeout
    promise?:Promise<P>
    onDone?:(result:P)=>void
    onError?:(error:Error)=>void
    onTimeout?:()=>void, 

}

export class InteruptableTask<T extends TaskState, P > {

    protected state:T
    protected internalState: InternalTaskState<P> = { isRunning: false }        
    protected props?:TaskProps<T,P>
    protected internalEvents = new EventEmitter()
    protected promise?:Promise<P>

    constructor(promise:Promise<any>, props?:TaskProps<T,P>   ) { 
        this.state = (props?.state??{}) as T;
        this.props = props;
        delete this.props.state

        this.promise = promise
        this.start()
    }

    getPromise():Promise<P> {    
        return this.internalState.promise;
    }

    getState():T {
        return this.state;
    }

    async run():Promise<P> {
        await resolveNextTick()
        return this.internalState.promise;
    }


    start():void {

        this.internalState.promise = new Promise<P>( (resolve,reject) => {

            this.internalState.isRunning = true
            this.internalState.onDone = resolve
            this.internalState.onError = reject
            this.internalState.tsStart = Date.now()

            const {timeout} = this.props
            if (timeout) {
                this.internalState.tsTimeout = this.internalState.tsStart + timeout
                this.internalState.onTimeout = this.onTimeout.bind(this)
                this.internalState.timeout = setTimeout( ()=>{ this.internalEvents.emit('timeout')}, timeout)
                this.internalEvents.on('timeout',this.internalState.onTimeout)
            }
    

            this.internalEvents.once('stopped',()=>{

                this.clearTimeout()
                this.internalState = { 
                    isRunning: false,
                }
    
                this.internalEvents.removeAllListeners();

                if (this.getState().result==='completed' || this.getState().result==='error') 
                    return;

                if (this.props.onDone)
                    resolve(this.props.onDone(this.getState()))
                else 
                    resolve(null)
            })

            this.promise?.then( (res:P) => {
                this.internalState = { 
                    isRunning: false,
                }
    
                this.getState().result = 'completed'
                this.internalEvents.emit('stopped') 
                resolve(res)
            }).catch( (err:Error) => {

                this.getState().result = 'error'
                this.getState().error = err
                this.internalEvents.emit('stopped')
                reject(err)
            })
    
        })

    }

    stop():Promise<boolean> {

        return new Promise<boolean>( (resolve) => {
            this.internalEvents.emit('stopped')
            resolveNextTick().then( () => {
                resolve(true)
            })
            
        })

    }

    /**
     * Checks if the operation is currently running.
     * @returns {boolean} - Returns true if the operation is running, otherwise false.
     */
    isRunning():boolean {
        return this.internalState.isRunning===true;
    }

    protected clearTimeout() {        
        if (this.internalState.timeout) {
            clearTimeout(this.internalState.timeout);
            this.internalEvents.off('timeout',this.internalState.onTimeout)
        }

        delete this.internalState.timeout        
    }

    protected onTimeout() {
        if (!this.internalState.timeout) 
            return;
     
        const message = this.props.name? `${this.props.name} timeout` : 'timeout';    
        this.logEvent({message,active:this.isRunning()})
        this.clearTimeout()

        this.getState().result = 'timeout'
        const resolve = this.internalState.onDone
        const reject = this.internalState.onError

        this.internalState = {  isRunning: false }

        if (this.props.errorOnTimeout??true) {
            reject(new Error('timeout'))
        }

        if (this.props.onDone)
            resolve(this.props.onDone(this.getState()))
        else 
            resolve(null)

    }

    protected logEvent(event:any) {
        if (this.props.log)
            this.props.log(event)
    }




    

}