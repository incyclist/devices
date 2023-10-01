
import { buildSetSlopeCommand, getBikeType, getCockpit, getGender, getWeight, parseRunData } from "./utils"

describe ('utils',()=>{

    describe('getCockpit',()=>{
        const res:string [] = []
        for (let i=0;i<256;i++)
            res.push( `0x${i.toString(16)}:${getCockpit(i)}` )
        expect(res).toMatchSnapshot()
    })

    describe('getBikeType',()=>{
        const res:string [] = []
        
        
        res.push( `race:${getBikeType('race')}` )
        res.push( `mountain:${getBikeType('mountain')}` )
        res.push( `triathlon:${getBikeType('triathlon')}` )
        res.push( `undefined:${getBikeType()}` )

        expect(res).toMatchSnapshot()
    })

    describe('getGender',()=>{        
        const testSet = ['M','F','X',undefined]
        const res = testSet.map( (i) =>  `0x${i}:${getGender(i)}` )
        expect(res).toMatchSnapshot()
    })

    describe('getWeight',()=>{
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
   
    
    
    })

    describe ('parseRunData',()=> { 
        test( 'valid data' ,()=>{ 
            let error=undefined;
            let data;
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
            let data;
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

    describe('buildSetSlopeCommand',()=>{
        test('0',()=>{
            const cmd = buildSetSlopeCommand(0,0)
            const res = Buffer.from(cmd).toString('hex').toUpperCase()
            
            expect(res).toBe('550000000000')
        } )

        test('88.5',()=>{
            const cmd = buildSetSlopeCommand(0,88.5)
            const res = Buffer.from(cmd).toString('hex').toUpperCase()
            expect(res).toBe('55000000B142')
        } )

        test('2.4',()=>{
            const cmd = buildSetSlopeCommand(0,2.4)
            const res = Buffer.from(cmd).toString('hex').toUpperCase()
            expect(res).toBe('55009A991940')
        } )

        test('3.3',()=>{
            const cmd = buildSetSlopeCommand(0,3.3)
            const res = Buffer.from(cmd).toString('hex').toUpperCase()
            expect(res).toBe('550033335340')
        } )

    })

})