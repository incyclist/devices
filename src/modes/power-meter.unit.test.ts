import DeviceAdapterBase from '../Device';
import DeviceProtocolBase from '../DeviceProtocol';
import PowerMeterMode,{config} from './power-meter'

class MockAdapter extends DeviceAdapterBase {
    constructor() {
        super( new DeviceProtocolBase())
    }
    getProtocolName(): string {
        return ('mock')
    }
}

describe('PowerMeterMode', () => {

    let mode;
    beforeAll( ()=> {
        mode = new PowerMeterMode( new MockAdapter());
    })
    describe ( 'getName', () => {
        test('should always return "PowerMeter"', () => {
            expect(mode.getName()).toBe('PowerMeter');
        })
    })

    describe ( 'getDescription', () => {
        test('should match description from config', () => {
            const descr = mode.getDescription();
            expect(descr).toBe(config.description);            
            expect(descr).toMatchSnapshot();
        })

    })

    
    describe ( 'getProperties', () => {
        test('should always return an empty array', () => {
            expect(mode.getProperties()).toEqual([]);
        })
    })

    describe ( 'getProperty', () => {
        test('should always return undefined', () => {
            expect(mode.getProperty('anything')).toBeUndefined();
        })
    })

    describe ( 'getBikeInitRequest', () => {
        test('should always return an empty object', () => {
            expect(mode.getBikeInitRequest()).toEqual({});
        })
    })

    
    describe ( 'sendBikeUpdate', () => {
        describe('slope',()=> {
            beforeEach(()=> {
                mode = new PowerMeterMode( new MockAdapter());
            })

            test('should be 0 if not set via sendBikeUpdate', () => {
                expect(mode.data.slope).toBe(0);
            })
            test('should be updated if set via sendBikeUpdate', () => {
                mode.sendBikeUpdate({slope:1});
                expect(mode.data.slope).toBe(1);
            })
    
        })

        test('should always return an empty object', () => {
            expect(mode.sendBikeUpdate()).toEqual({});
            expect(mode.sendBikeUpdate({})).toEqual({});
            expect(mode.sendBikeUpdate({targetPower:100})).toEqual({});
            expect(mode.sendBikeUpdate({slope:2.1})).toEqual({});
        })
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

})