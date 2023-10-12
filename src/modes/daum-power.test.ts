import DaumPowerMeterCyclingMode from "./daum-power"
import MockAdapter from '../../test/mock-adapter';

describe('DaumPower',()=>{
    test('statics',()=>{
        const m = new DaumPowerMeterCyclingMode(new MockAdapter())

        expect(m.getName()).toBe('PowerMeter')
        expect(m.getDescription()).toMatchSnapshot()
        expect(m.getProperties()).toEqual([])
        expect(DaumPowerMeterCyclingMode.supportsERGMode()).toBe(false)        
                
    })

    test('init request is always slope:0',()=>{
        const m = new DaumPowerMeterCyclingMode(new MockAdapter())
        const res = m.getBikeInitRequest()
        expect(res).toMatchObject({slope:0})
    })

})