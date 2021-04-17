import {runWithRetries, sleep, Queue} from './utils'

describe( 'sleep',()=> {
    test ( 'successfull run' ,async ()=> {
        const t=Date.now()
        await sleep(10 );
        const tE = Date.now();
        expect( (tE-t)>10 ).toBe(true); 
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

describe( 'Queue' ,()=> {
    test('dequeue',()=> {
        const queue = new Queue<number>([1,2,3]);
        const res = queue.dequeue()
        expect(res).toBe(1);
        expect(queue.data).toEqual([2,3])
    })
})