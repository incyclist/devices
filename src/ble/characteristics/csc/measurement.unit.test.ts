import {CscMeasurement} from './measurement.js'

describe('BleCscMeasurement',()=>{

    const M = (str) => Buffer.from(str,'hex')   

    test('parse',()=>{
        const parser = new CscMeasurement() 

        parser.parse( M('03d9000000770c01000098'))
        const res1 = {...parser.parse( M('01db0000001812'))}
        expect(res1.speed).toBeCloseTo(10.8,1)
        expect(res1.cadence).toBeUndefined()

        const res2 = {...parser.parse( M('03dc000000911403004e9f'))}
        expect(res2.speed).toBeCloseTo(12.3,1)
        expect(res2.cadence).toBeCloseTo(66,0)

        
    })

    test('defect',()=>{
        const parser = new CscMeasurement()

        parser.parse( M('02f70050c1'))
        const res3 = {...parser.parse( M('02f8006bc3'))}
        expect(res3.speed).toBeUndefined()
        expect(res3.cadence).toBeCloseTo(114,0)




    })

    // production log 2026-08-20: BLE reconnect caused the sensor's cumulative wheel-revolution
    // counter to reset to 0, which the parser diffed against its stale pre-disconnect baseline
    // (revolutions=3435) and produced a large negative speed instead of treating it as a fresh start
    test('wheel revolution reset after a BLE reconnect must not produce a negative speed',()=>{
        const parser = new CscMeasurement()
        parser.setWheelCircumference(2.118)

        // establish a baseline, then a normal (no-motion) repeat, matching the production trace
        parser.parse( M('016b0d0000e282'))
        parser.parse( M('016b0d0000e282'))

        // simulate the sensor onDisconnect/reconnect handling clearing the parser's stale state
        parser.reset()

        // first notification after reconnect: sensor's onboard counters reset to 0
        const res = {...parser.parse( M('01000000000000'))}

        expect(res.speed===undefined || res.speed>=0).toBe(true)
    })

})