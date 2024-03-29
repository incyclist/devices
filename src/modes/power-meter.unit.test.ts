import MockAdapter from '../../test/mock-adapter';
import PowerMeterMode from './power-meter'


describe('PowerMeterMode', () => {

    let mode;
    beforeAll( ()=> {
        mode = new PowerMeterMode( new MockAdapter());
    })


    describe ( 'statics', () => {
        test('should always return "PowerMeter"', () => {
            expect(mode.getName()).toBe('PowerMeter');
        })

        test('suppport ERG Mode',()=>{
            expect(PowerMeterMode.supportsERGMode()).toBe(false)                        
        })
    })

    describe ( 'getDescription', () => {
        test('should match description from config', () => {
            const descr = mode.getDescription();
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

    describe('copyBikeData',()=>{
        beforeEach(()=> {
            
        })

        test('bike sends cadence info',()=>{
            const m = new PowerMeterMode( new MockAdapter());
            const data = m.copyBikeData({power:0, pedalRpm:0, speed:0},{power:100, pedalRpm:90,isPedalling:true, speed:30}) 
            expect(data).toMatchObject({power:100, pedalRpm:90,isPedalling:true, speed:30})

        })

        test('bike does not send cadence info',()=>{
            const m = new PowerMeterMode( new MockAdapter());
            const data = m.copyBikeData({power:0, pedalRpm:0, speed:0},{power:100, pedalRpm:0,isPedalling:false, speed:30}) 
            expect(data).toMatchObject({power:100, pedalRpm:0,isPedalling:true, speed:30})

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

    })

})