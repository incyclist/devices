import DeviceAdapterBase from '../Device';
import DeviceProtocolBase from '../DeviceProtocol';
import PowerMeterMode from './power-base'

class MockAdapter extends DeviceAdapterBase {
    constructor() {
        super( new DeviceProtocolBase())
    }
}

describe('PowerMeterMode', () => {

    let mode;
    beforeAll( ()=> {
        mode = new PowerMeterMode( new MockAdapter());
    })

    describe ( 'getWeight', () => { 
        const DEFAULT_WEIGHT = 85;

        describe ( 'adapter has getWeight()', () => { 
            let testWeight;
            beforeAll(()=> {
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
        describe ( 'adapter does not have getWeight()', () => { 
            test('should return default weight', () => {
                expect(mode.getWeight()).toBe(DEFAULT_WEIGHT);
            })

        })

    })

    describe ( 'calculateSpeedAndDistance', () => { 

        beforeEach( ()=> {
            mode = new PowerMeterMode( new MockAdapter());
        })


        test('150W,0%, 70kg', ()=>{
            const values = [];
            for (let i=0; i<30; i++) {
                values.push({t:i+1, ...mode.calculateSpeedAndDistance(150, 0,78.5, 1)});
            }
            expect(values).toMatchSnapshot()
            //expect(values[9].speed).toEqual(18);
        })

        test('0W, 45km/h, 0%', ()=>{
            mode.data.speed = 45;
            const values = [];
            for (let i=0; i<30; i++) {
                values.push({t:i+1, ...mode.calculateSpeedAndDistance(0, 0,80, 1)});
            }
            expect(values).toMatchSnapshot()

        })


        test('0W, 30km/h, -7%, 72kg', ()=>{
            // maximum speed that can be achieved with 0W and -7% is 52km/h
            // loop could be exended to >1000 but that would not change the result
            mode.data.speed = 45;
            const values = [];
            for (let i=0; i<100; i++) {
                values.push({t:i+1, ...mode.calculateSpeedAndDistance(0, -7,72, 1,{cwA:0.3784, cRR:0.005, rho:1.18})});
            }
            expect(values[values.length-1].speed).toBeCloseTo(52,0)

        })

    })
})