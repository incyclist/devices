import MockAdapter, { MockConfig } from '../../test/mock-adapter';
import PowerMeterMode from './power-base'



describe('PowerMeterMode', () => {

    let mode


    describe ( 'getWeight', () => { 
        const DEFAULT_WEIGHT = 85;

        describe ( 'adapter has getWeight()', () => { 
            let testWeight;
            beforeAll(()=> {
                mode = new PowerMeterMode( new MockAdapter(),MockConfig);
                mode.adapter.getWeight = ()=> testWeight;
            })

            afterAll(()=> {
                mode.adapter.getWeight = undefined;
            })

            test('should return the weight from adapter', () => {
                testWeight = 100;
                expect(mode.getWeight()).toBe(testWeight);
            })
            test('should return default if adapter.getWeight() returns undefined or 0', () => { 
                testWeight = 0;
                expect(mode.getWeight()).toBe(DEFAULT_WEIGHT);
                testWeight = undefined;
                expect(mode.getWeight()).toBe(DEFAULT_WEIGHT);
            })
            
            

        })

    })

    describe ( 'calculateSpeedAndDistance', () => { 

        beforeEach( ()=> {
            mode = new PowerMeterMode( new MockAdapter(),MockConfig);
        })

        type TestData = {
            t: number,
            speed: number,
            distance: number
        }


        test('150W,0%, 70kg', ()=>{
            const values:TestData[] = [];
            for (let i=0; i<30; i++) {
                values.push({t:i+1, ...mode.calculateSpeedAndDistance(150, 0,78.5, 1)});
            }
            expect(values).toMatchSnapshot()
            //expect(values[9].speed).toEqual(18);
        })

        test('0W, 45km/h, 0%', ()=>{
            mode.data.speed = 45;
            const values:TestData[] = [];
            for (let i=0; i<30; i++) {
                values.push({t:i+1, ...mode.calculateSpeedAndDistance(0, 0,80, 1)});
            }
            expect(values).toMatchSnapshot()

        })


        test('0W, 30km/h, -7%, 72kg', ()=>{
            // maximum speed that can be achieved with 0W and -7% is 52km/h
            // loop could be exended to >1000 but that would not change the result
            mode.data.speed = 45;
            const values:TestData[] = [];
            for (let i=0; i<100; i++) {
                values.push({t:i+1, ...mode.calculateSpeedAndDistance(0, -7,72, 1,{cwA:0.3784, cRR:0.005, rho:1.18})});
            }
            expect(values[values.length-1].speed).toBeCloseTo(52,0)

        })

        test('accelerate from 30km/h with 307W ,0%, 70kg within 1s', ()=>{
            mode.data.speed = 30;
            const res = mode.calculateSpeedAndDistance(307, 0,70, 1)                        
            expect(res.speed).toBeCloseTo(31,0)
            expect(res.distance).toBeCloseTo(31/3.6,1)
            
        })

        test('accelerate from 30km/h with 307W ,0%, 70kg for 30s re more', ()=>{
            let res
            mode.data.speed = 30;
            res = mode.calculateSpeedAndDistance(307, 0,70, 30)                        
            expect(res.speed).toBeCloseTo(40,0)
            expect(res.distance).toBe(0)

            mode.data.speed = 30;
            res = mode.calculateSpeedAndDistance(307, 0,70, 300)                        
            expect(res.speed).toBeCloseTo(40,0)
            expect(res.distance).toBe(0)

            mode.data.speed = 30;            
            res = mode.calculateSpeedAndDistance(307, 0,70, 29.99)                        
            expect(res.distance).toBeGreaterThan(0)

        })


    })
    describe ( 'calculatePowerAndDistance', () => { 

        beforeEach( ()=> {
            mode = new PowerMeterMode( new MockAdapter(),MockConfig);
        })


        test('keep speed at 30km/h,0%, 70kg, 1s since last update', ()=>{
            mode.data.speed = 30;
            const res = mode.calculatePowerAndDistance(30, 0,70, 1)                        
            expect(res.power).toBeCloseTo(143,0)
            expect(res.distance).toBeCloseTo(30/3.6,1)
            
        })

        test('keep speed at 30km/h,0%, 70kg, 0s since last update', ()=>{
            mode.data.speed = 30;
            const res = mode.calculatePowerAndDistance(30, 0,70, 0)                        
            expect(res.power).toBeCloseTo(143,0)
            expect(res.distance).toBe(0)
            
        })

        test('keep speed at 30km/h,5%, 70kg for 1s', ()=>{
            mode.data.speed = 30;
            const res = mode.calculatePowerAndDistance(30, 5,70, 1)                        
            expect(res.power).toBeCloseTo(428,0)
            expect(res.distance).toBeCloseTo(30/3.6,1)            
        })

        test('accelerate to 31km/h,0%, 70kg within 1s', ()=>{
            mode.data.speed = 30;
            const res = mode.calculatePowerAndDistance(31, 0,70, 1)                        
            expect(res.power).toBeCloseTo(307,0)
            expect(res.distance).toBeCloseTo(31/3.6,1)
            
        })


    })

    describe( 'getTimeSinceLastUpdate',()=>{

        let m:PowerMeterMode
        beforeEach( ()=> {
            m = new PowerMeterMode( new MockAdapter(),MockConfig);
            jest.useFakeTimers().setSystemTime(new Date('2020-01-01'));
        })

        afterEach( ()=>{
            jest.useRealTimers()
        })

        test('no update',()=>{
            const res = m.getTimeSinceLastUpdate()
            expect(res).toBe(0)
        })
        test('single update',()=>{
            let res;

            res = m.getTimeSinceLastUpdate()
            expect(res).toBe(0)

            m.updateData({power:0, speed:0, pedalRpm:0})
            res = m.getTimeSinceLastUpdate()
            expect(res).toBe(0)

            jest.advanceTimersByTime(1000)
            res = m.getTimeSinceLastUpdate()
            expect(res).toBe(1)

        })
        
    })  
    
    describe('sendBikeUpdate',()=>{
        test('min and max set, no target - prev target was set',()=> {
            mode = new PowerMeterMode( new MockAdapter(),MockConfig);            
            mode.prevRequest = {targetPower:189,maxPower:120,minPower:120}
            mode.getData = jest.fn().mockReturnValue({speed:21.536649864620777,power:189,distanceInternal:4426.551358050015,pedalRpm:90,isPedalling:true,heartrate:133,time:838.25,slope:2.4671999338821853})

            const res = mode.sendBikeUpdate({time:700.959,minPower:120,maxPower:120,duration:180,remaining:139.04100000000005,slope:1.770673544051941})

            expect(res.targetPower).toBe(120)
        })

    })


})