import {runWithRetries, sleep, Queue,hexstr,floatVal,intVal, waitWithTimeout} from './utils'

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();


describe('utils',()=>{
    describe.skip( 'sleep',()=> {

        test ( 'successfull run' ,async ()=> {
            const t=Date.now()
            await sleep(10 );
            const tE = Date.now();
            expect( (tE-t) ).toBeGreaterThanOrEqual(10);
        })    
    })
    
    describe ( 'runWithRetries()', ()=> {
    
        describe ( 'promise' ,()=> {
            test ( 'successfull run' ,async ()=> {
                const fn = ()=> { return new Promise( resolve => resolve('X')) }
        
                const res = await runWithRetries(fn, 5, 10000 );
                expect(res).toBe('X'); 
            })
    
            test ( 'retry success after failure' ,async ()=> {
                let cnt = 0;
                const fn = ()=> { 
                    return new Promise( (resolve,reject) => { 
                        if ( cnt++===0) reject( new Error('error')); 
                        else resolve('X') 
                    })
                }
        
                const res = await runWithRetries(fn, 5, 110 );  // retry after 110ms (> interval time)
                expect(res).toBe('X'); 
            })
    
            test ( 'retry too many failures' ,async ()=> {
                let cnt = 0;
                const fn = ()=> { 
                    return new Promise( (resolve,reject) => { 
                        if ( cnt++===3) resolve('X')
                        else  reject( new Error('error')); 
                    })
                }
                let error;
                try {
                    await runWithRetries(fn, 2, 10 );
                }
                catch ( err) {
                    error = err;
                }
                expect(error.message).toBe('error'); 
            })
    
    
        })
    
        describe( 'sync',()=> {
            test ( 'successfull run' ,async ()=> {
                const fn = ()=> { return 'Y' }
        
                const res = await runWithRetries(fn, 5, 10000 );
                expect(res).toBe('Y'); 
            })    
    
    
            test ( 'retry success after failure' ,async ()=> {
                let cnt = 0;
                const fn = ()=> { 
                    if ( cnt++===0) throw( new Error('error')); 
                    else return 'Y' 
                }
        
                const res = await runWithRetries(fn, 5, 10 );
                expect(res).toBe('Y'); 
            })
    
            test ( 'retry too many failures' ,async ()=> {
                let cnt = 0;
                const fn = ()=> { 
                    return new Promise( () => { 
                        if ( cnt++===3) return 'Y'
                        else  throw( new Error('error')); 
                    })
                }
                let error;
                try {
                    await runWithRetries(fn, 2, 10 );
                }
                catch ( err) {
                    error = err;
                }
                expect(error.message).toBe('error'); 
            })
    
        })
    
    
    })

    describe( 'floatVal',()=>{
        test('valid string', ()=>{ expect(floatVal('1.2')).toBe(1.2)})
        test('valid float', ()=>{ expect(floatVal(1.2)).toBe(1.2)})
        test('valid float', ()=>{ expect(floatVal(undefined)).toBeUndefined()})
        test('NaN', ()=>{ expect(floatVal( `$(1/0)` )).toBeUndefined()})

    })
    describe( 'intVal',()=>{
        test('valid string', ()=>{ expect(intVal('1')).toBe(1)})
        test('valid float as string', ()=>{ expect(intVal('3.6')).toBe(3)})
        test('valid int', ()=>{ expect(intVal(2)).toBe(2)})
        test('valid float float part <0.5', ()=>{ expect(intVal(2.49)).toBe(2)})
        test('valid float float part >0.5', ()=>{ expect(intVal(2.6)).toBe(2)})
        test('valid float', ()=>{ expect(intVal(undefined)).toBeUndefined()})
        test('NaN', ()=>{ expect(intVal( `$(1/0)` )).toBeUndefined()})


    })

    describe('hexstr',()=>{
        test('array of numbers',()=>{            
            const h = hexstr([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16])
            expect(h).toBe('0 1 2 3 4 5 6 7 8 9 A B C D E F 10')
        })
        test('array of numbers with start index',()=>{            
            const h = hexstr([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],10)
            expect(h).toBe('A B C D E F 10')
        })
        test('array of numbers with start index and len',()=>{            
            const h = hexstr([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],10,2)
            expect(h).toBe('A B')
        })
        test('start+len > array length',()=>{            
            const h = hexstr([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],10,10)
            expect(h).toBe('A B C D E F 10')
        })

    })
    
    describe( 'Queue' ,()=> {
        test('dequeue',()=> {
            const queue = new Queue<number>([1,2,3]);
            const res = queue.dequeue()
            expect(res).toBe(1);
            expect((queue as any).data).toEqual([2,3])
        })
        describe('size',()=> {

            test( 'normal',()=>{
                const queue = new Queue<number>([1,2,3]);           
                expect(queue.size()).toBe(3);    
            })
            test( 'empty',()=>{
                const queue = new Queue<number>();           
                expect(queue.size()).toBe(0);
            })
            
        })

        test('clear',()=> {
            const queue = new Queue<number>([1,2,3]);
            expect(queue.size()).toBe(3);
            queue.clear();
            expect(queue.size()).toBe(0);
        })

        describe('isEmpty',()=>{
            const q = new Queue<string>()
            expect(q.isEmpty()).toBeTruthy()

            q.enqueue('test')
            expect(q.isEmpty()).toBeFalsy()
        })


    })

    describe ( 'waitWithTimeout()', ()=> {

        let to

        afterEach( ()=>{
            if (to)
                clearTimeout(to)
        })

        describe ( 'promise fullfils' ,()=> {
            test ( 'promise fullfils' ,async ()=> {
                const fn = new Promise( resolve => resolve('X')) 
                const onTimeout = jest.fn()

                const res = await waitWithTimeout(fn,50,onTimeout)
                expect(res).toBe('X'); 

                await sleep(100)
                expect(onTimeout).not.toHaveBeenCalled()
            })
    
            test ( 'promise rejects - does not throw an Error,returns undefined' ,async ()=> {
                const fn = new Promise( (_resolve,reject) => {reject (new Error('X'))}) 
                const onTimeout = jest.fn()
                
                const res = await waitWithTimeout(fn,100,onTimeout)
                expect(res).toBeUndefined()

                await sleep(100)
                expect(onTimeout).not.toHaveBeenCalled()
                
            })
    

            test('timeout with Callback',async ()=>{
                const fn = new Promise( resolve => {to=setTimeout(()=>{resolve('X')},5000)}) 
                const onTimeout = jest.fn()
                
                const res = await waitWithTimeout(fn,100,onTimeout)
                expect(res).toBeUndefined()
                expect(onTimeout).toHaveBeenCalled()   
            })

            test('timeout without Callback',async ()=>{
                const fn = new Promise( resolve => {to=setTimeout(()=>{resolve('X')},5000)}) 
                
                expect( async ()=>{ await waitWithTimeout(fn,100,undefined)}).rejects.toThrow('Timeout')
            })

        })
    })


})
