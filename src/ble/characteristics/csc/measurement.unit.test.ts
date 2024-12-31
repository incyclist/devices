import {CscMeasurement} from './measurement'

describe('BleCscMeasurement',()=>{

    const M = (str) => Buffer.from(str,'hex')   

    test('parse',()=>{
        const parser = new CscMeasurement() 

        parser.parse( M('03d9000000770c01000098'))
        const res1 = {...parser.parse( M('01db0000001812'))}
        expect(res1.speed).toBeCloseTo(3.0,1)
        expect(res1.cadence).toBeUndefined()

        const res2 = {...parser.parse( M('03dc000000911403004e9f'))}
        expect(res2.speed).toBeCloseTo(3.4,1)
        expect(res2.cadence).toBeCloseTo(66,0)
                                        
        
    })
})