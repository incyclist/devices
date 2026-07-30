import { InteruptableTask } from './task'

describe('InteruptableTask', ()=>{

    describe('getUnderlyingPromise (FIXES_BACKLOG #23)', ()=>{

        // FIXES_BACKLOG #23: BleAdapter.stop() needs a way to know when the *actual* wrapped
        // async work (e.g. a still in-flight startAdapter() call) has genuinely finished, as
        // opposed to run()/getPromise(), which settle as soon as stop() is called (i.e. only
        // reflect that the caller no longer wants to keep waiting). getUnderlyingPromise() exposes
        // the raw promise the task was constructed with, so it can be awaited for that purpose.

        test('returns the raw promise passed to the constructor', ()=>{
            const raw = Promise.resolve(true)
            const task = new InteruptableTask<any,boolean>(raw, { errorOnTimeout:false })

            expect(task.getUnderlyingPromise()).toBe(raw)
        })

        test('does not settle when stop() is called - only once the underlying work genuinely finishes', async ()=>{
            let resolveRaw: (v:boolean)=>void
            const raw = new Promise<boolean>( resolve => { resolveRaw = resolve })
            const task = new InteruptableTask<any,boolean>(raw, { errorOnTimeout:false })

            let underlyingSettled = false
            task.getUnderlyingPromise().then( ()=> { underlyingSettled = true })

            // stop() resolves the task's own wrapper promise (run()/getPromise()) almost
            // immediately - but the underlying raw work is still pending
            await task.stop()
            expect(underlyingSettled).toBe(false)

            // now let the underlying work genuinely finish
            resolveRaw(true)
            await task.getUnderlyingPromise()

            expect(underlyingSettled).toBe(true)
        })

        test('run()/getPromise() settle on stop() well before the underlying promise does', async ()=>{
            let resolveRaw: (v:boolean)=>void
            const raw = new Promise<boolean>( resolve => { resolveRaw = resolve })
            const task = new InteruptableTask<any,boolean>(raw, { errorOnTimeout:false })

            // capture the wrapper promise the way a real caller (e.g. BleAdapter.start()) does -
            // before stop() is ever called
            const runPromise = task.run()

            const stopped = await task.stop()
            expect(stopped).toBe(true)

            // the wrapper/run() promise has already resolved via stop() - the raw promise
            // underneath is a completely separate, still-pending promise
            const result = await runPromise
            expect(result).toBeNull()

            // clean up the still-pending raw promise so it doesn't leak between tests
            resolveRaw(true)
            await task.getUnderlyingPromise()
        })

        test('settles with an error if the underlying work rejects', async ()=>{
            let rejectRaw: (e:Error)=>void
            const raw = new Promise<boolean>( (_resolve,reject) => { rejectRaw = reject })
            const task = new InteruptableTask<any,boolean>(raw, { errorOnTimeout:false })
            // the rejection also propagates to the task's own wrapper promise (run()/getPromise()) -
            // consume it here so it doesn't surface as an unrelated unhandled-rejection warning
            task.getPromise()?.catch( ()=>{} )

            const err = new Error('gatt operation already in progress')
            rejectRaw(err)

            await expect(task.getUnderlyingPromise()).rejects.toThrow('gatt operation already in progress')
        })

    })

    describe('onCancel (FIXES_BACKLOG #25)', ()=>{

        // FIXES_BACKLOG #25: onCancel is the hook callers use to signal cancellation (e.g. abort an
        // AbortController) to whatever is still genuinely running underneath, the moment this task
        // itself gives up - either via its own timeout, or an explicit stop(). It must never fire on
        // natural completion/error of the wrapped promise.

        test('fires when the task times out', async ()=>{
            const raw = new Promise<boolean>( ()=>{} )   // never settles on its own
            const onCancel = vi.fn()

            const task = new InteruptableTask<any,boolean>(raw, { timeout:10, errorOnTimeout:false, onCancel })

            await task.run()

            expect(onCancel).toHaveBeenCalledTimes(1)
        })

        test('fires when explicitly stopped', async ()=>{
            const raw = new Promise<boolean>( ()=>{} )   // never settles on its own
            const onCancel = vi.fn()

            const task = new InteruptableTask<any,boolean>(raw, { errorOnTimeout:false, onCancel })

            await task.stop()

            expect(onCancel).toHaveBeenCalledTimes(1)
        })

        test('does not fire when the wrapped promise completes naturally', async ()=>{
            const raw = Promise.resolve(true)
            const onCancel = vi.fn()

            const task = new InteruptableTask<any,boolean>(raw, { errorOnTimeout:false, onCancel })

            await task.run()

            expect(onCancel).not.toHaveBeenCalled()
        })

        test('does not fire a second time when stop() is called after a timeout already fired', async ()=>{
            const raw = new Promise<boolean>( ()=>{} )
            const onCancel = vi.fn()

            const task = new InteruptableTask<any,boolean>(raw, { timeout:10, errorOnTimeout:false, onCancel })

            await task.run()
            await task.stop()

            expect(onCancel).toHaveBeenCalledTimes(1)
        })

    })

})
