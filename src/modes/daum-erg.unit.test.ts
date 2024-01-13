import MockAdapter, { MockConfig } from "../../test/mock-adapter";
import ERGCyclingMode from './daum-erg'
describe( 'DaumERGMode',()=>{

    describe('sendBikeUpdate',()=>{
        test('min and max set, no target - prev target was set',()=> {
            const mode = new ERGCyclingMode( new MockAdapter(),MockConfig);            
            mode.prevRequest = {targetPower:189,maxPower:120,minPower:120}
            mode.getData = jest.fn().mockReturnValue({speed:21.536649864620777,power:189,distanceInternal:4426.551358050015,pedalRpm:90,isPedalling:true,heartrate:133,time:838.25,slope:2.4671999338821853})

            const res = mode.sendBikeUpdate({minPower:120,maxPower:120,slope:1.770673544051941})

            expect(res.targetPower).toBe(120)
        })

        test('gear up',()=> {
            const mode = new ERGCyclingMode( new MockAdapter(),MockConfig);            

            mode.prevRequest = {targetPower:189,maxPower:120,minPower:120}
            mode.getData = jest.fn().mockReturnValue({gear:10, speed:21.536649864620777,power:189,distanceInternal:4426.551358050015,pedalRpm:90,isPedalling:true,heartrate:133,time:838.25,slope:2.4671999338821853})

            const res = mode.sendBikeUpdate({targetPowerDelta:5})

            expect(res).toMatchObject({gear:11})
        })

    })

    
})