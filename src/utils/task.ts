import { EventEmitter } from "node:events"
import { resolveNextTick } from "./utils.js"

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

    /**
     * Side-effect hook invoked synchronously whenever this task gives up on the wrapped promise -
     * either because its own timeout fired, or because it was explicitly stop()'d (never on natural
     * completion/error of the wrapped promise itself). Unlike `onDone`, its return value is ignored;
     * it exists purely so callers can signal cancellation (e.g. abort an AbortController) to whatever
     * async work is still genuinely running underneath, instead of just abandoning it (FIXES_BACKLOG
     * #25 - the same class of bug fixed for Adapter.start()/stop() in #23, applied one layer deeper).
     */
    onCancel?: () => void
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
    protected onStopNotifiers: Array<()=>void> = []
    protected cancelNotified = false

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

    /**
     * Returns the raw promise this task was constructed with (e.g. the actual async operation -
     * such as `startAdapter()` - still executing underneath).
     *
     * Unlike `getPromise()`/`run()`, which settle as soon as the task is told to stop or hits its
     * timeout (i.e. they only reflect that the caller no longer wants to keep waiting), this
     * promise only settles once the wrapped work has genuinely finished executing - completed,
     * thrown, or otherwise done. Callers that need to know the underlying work has *truly*
     * finished (not just been signalled to stop) should await this instead (see
     * FIXES_BACKLOG #23 - `BleAdapter.stop()` uses this to avoid resolving before a still in-flight
     * `startAdapter()` run has actually settled).
     */
    getUnderlyingPromise():Promise<any>|undefined {
        return this.promise;
    }

    getState():T {
        return this.state;
    }

    async run():Promise<P> {
        if (!this.internalState.isRunning)
            await resolveNextTick()
        return this.internalState.promise;
    }

    notifyOnStop(cb:()=>void) {
        this.onStopNotifiers.push(cb)        
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

                this.sendStopNotification()

                if (this.getState().result==='completed' || this.getState().result==='error')
                    return;

                this.notifyCancel()

                this.getState().result = 'stopped'

                if (this.props.onDone)
                    resolve(this.props.onDone(this.getState()))
                else 
                    resolve(null)
            })

            this.promise?.then( (res:P) => {
                this.clearTimeout()

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

        this.notifyCancel()

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

    /**
     * Invokes `onCancel` at most once per task, however many of timeout/explicit-stop paths reach
     * it (e.g. an explicit stop() called after the timeout already fired independently) - so callers
     * can rely on "cancelled at most once" without having to make their own handler idempotent.
     */
    protected notifyCancel() {
        if (this.cancelNotified)
            return
        this.cancelNotified = true
        this.props.onCancel?.()
    }

    protected sendStopNotification() {
        this.onStopNotifiers.forEach( (cb) => {
            if (typeof cb === 'function')
                cb()
        })
    }

    protected logEvent(event:any) {
        if (this.props.log)
            this.props.log(event)
    }




    

}