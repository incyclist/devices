import {runWithRetries, sleep, Queue,hexstr} from './utils'

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();


describe('utils',()=>{
    describe( 'sleep',()=> {

        test ( 'successfull run' ,async ()=> {
            const t=Date.now()
            await sleep(10 );
            const tE = Date.now();
            expect( (tE-t)>=10 ).toBe(true); 
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
                    return new Promise( (resolve,reject) => { 
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
            expect(queue.data).toEqual([2,3])
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
            test( 'data undefined',()=>{
                const queue = new Queue<number>();           
                queue.data = undefined;
                expect(queue.size()).toBe(0);
            })
            
        })

        test('clear',()=> {
            const queue = new Queue<number>([1,2,3]);
            expect(queue.size()).toBe(3);
            queue.clear();
            expect(queue.size()).toBe(0);
        })

    })
})
