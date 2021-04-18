import { getWeight } from "./utils"

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

})