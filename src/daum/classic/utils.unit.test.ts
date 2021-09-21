import { getWeight, parseRunData } from "./utils"

describe ('utils',()=>{

    test( '50kg',()=>{
        const res=getWeight(50)
        expect(res).toBe(50)
    })

    test( '50.123kg => returns 50',()=>{
        const res=getWeight(50.123)
        expect(res).toBe(50)
    })

    test( '49.5kg => returns 50',()=>{
        const res=getWeight(49.5)
        expect(res).toBe(50)
    })

    test( '<10kg => returns 10',()=>{
        const res=getWeight(2)
        expect(res).toBe(10)
    })

    test( '<250kg => returns 250',()=>{
        const res=getWeight(2000)
        expect(res).toBe(250)
    })

    test( 'undefined => returns 80',()=>{
        const res=getWeight(undefined)
        expect(res).toBe(80)
    })
    test( 'null => returns 80',()=>{
        const res=getWeight(null)
        expect(res).toBe(80)
    })

    test( 'string => returns 80',()=>{
        const res=getWeight('John Doe')
        expect(res).toBe(80)
    })

    test( 'number as string => returns number (rounded)',()=>{
        const res=getWeight('75.2')
        expect(res).toBe(75)
    })

    describe ('parseRunData',()=> { 
        test( 'valid data' ,()=>{ 
            let error=undefined;
            let data = undefined;
            try {
                data = parseRunData( [0x40,0,0,0,0xC0,0x13,0,0,0xF9,3,0x28,0x2E,3,41,0,0,7,0xE4,0x32]);
            } catch (e) {
                error =e;
            }
            expect(error).toBeUndefined();
            expect(data).toBeDefined()
            expect(data).toMatchObject( {power:95})
        })

        test( 'invalidvalid data: "pedalling=0x40"' ,()=>{ 
            let error=undefined;
            let data = undefined;
            try {
                data = parseRunData( [0x40,0,0,0,0x40,5,0,0,0,0,0,0,0,0,0,0,0xA,0,0]);
            } catch (e) {
                error =e;
            }
            expect(error).toBeUndefined();
            expect(data).toBeDefined()
            expect(data).toMatchObject( {power:25})

            //expect(error).toBeDefined();
            //expect(error.message).toBe('Invalid data')
        })
    })

})