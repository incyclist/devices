import MockAdapter from '../../test/mock-adapter';
import FMResistanceMode from './fm-resistance'


describe('BleFMResistanceMode', () => {

    let mode:FMResistanceMode;
    beforeAll( ()=> {
        mode = new FMResistanceMode( new MockAdapter());
    })


    describe ( 'statics', () => {
        test('getName', () => {
            expect(mode.getName()).toBe('Resistance');
        })

        test('isERG, isSIM, isResistance', () => {
            expect(mode.isERG()).toBe(false);
            expect(mode.isSIM()).toBe(false);
            expect(mode.isResistance()).toBe(true);
        })

        test('suppport ERG Mode',()=>{
            expect(FMResistanceMode.supportsERGMode()).toBe(false)
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
            expect(mode.getProperties()).toMatchObject([{key:'startGear', name: 'Initial Gear', description: 'Initial Gear', type: 'Integer',default:5,min:1, max:26}]);
        })
    })

    describe ( 'getBikeInitRequest', () => {
        test('with default settings', () => {
            expect(mode.getBikeInitRequest()).toEqual({targetResistance:16});
        })
        test('with user defined settings', () => {
            mode.setSetting('startGear',11);
            expect(mode.getBikeInitRequest()).toEqual({targetResistance:40});
        })
    })

    describe ( 'sendBikeUpdate', () => {
        describe('slope',()=> {
            beforeEach(()=> {
                mode = new FMResistanceMode( new MockAdapter());
            })

            test('should be 0 if not set via sendBikeUpdate', () => {
                expect(mode.data.slope).toBe(0);
            })
            test('should be updated if set via sendBikeUpdate', () => {
                mode.sendBikeUpdate({slope:1});
                expect(mode.data.slope).toBe(1);
            })
    
        })

        test('new resistance target', () => {
            expect(mode.sendBikeUpdate({targetResistance:100})).toEqual({targetResistance:100});            
            
            expect(mode.sendBikeUpdate({targetResistance:-1})).toEqual({targetResistance:0});            
            expect(mode.sendBikeUpdate({targetResistance:1000})).toEqual({targetResistance:100});            
            expect(mode.sendBikeUpdate({targetResistance:5.6})).toEqual({targetResistance:5});                        
        })

        test('gear change', () => {
            mode.sendBikeUpdate(mode.getBikeInitRequest())

            expect(mode.sendBikeUpdate({gearDelta:3})).toEqual({targetResistance:28});            
            expect(mode.sendBikeUpdate({gearDelta:-2})).toEqual({targetResistance:20});            
            expect(mode.sendBikeUpdate({gearDelta:-10})).toEqual({targetResistance:0});            
            expect(mode.sendBikeUpdate({gearDelta:30})).toEqual({targetResistance:100});            
        })
    })

    describe( 'updateData', () => {
        beforeEach(()=> {
            mode = new FMResistanceMode( new MockAdapter());
        })

        test('should set gear based on resistance', () => {
            let data = mode.updateData( { power:100, resistance:0, speed:20, pedalRpm:60} );
            expect(data.gear).toBe(1);

            data = mode.updateData( { power:100, resistance:50, speed:20, pedalRpm:60} );
            expect(data.gear).toBe(13);

            data = mode.updateData( { power:100, resistance:100, speed:20, pedalRpm:60} );
            expect(data.gear).toBe(26);
        })
    })


    describe ( 'confirmed', () => {
        beforeEach(()=> {
            mode = new FMResistanceMode( new MockAdapter());
        })          
        test('should store confirmed resistance', () => {
            mode.confirmed( { targetResistance:55 } );
            expect( (mode as any).confirmedResistance ).toBe(55);
        })  
    })


})