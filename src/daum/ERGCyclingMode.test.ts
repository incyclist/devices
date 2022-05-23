import ERGCyclingMode from "./ERGCyclingMode";
import { CyclingModeProperyType } from "../CyclingMode";
import DaumAdapter from './DaumAdapter'
import { EventLogger } from "gd-eventlog";

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

describe( 'ERGCyclingMode',()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined)

    })

    describe ( 'constructor()',()=>{
        test( 'only adapter provided',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter);
            
            expect( cyclingMode.adapter ).toBe( adapter );
            expect( cyclingMode.logger ).toBeDefined();
            expect( cyclingMode.settings ).toEqual({});
        } );

        test( 'with adapter and settings',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            
            expect( cyclingMode.adapter ).toBe( adapter );
            expect( cyclingMode.logger ).toBeDefined();
            expect( cyclingMode.settings['test'] ).toBeTruthy();
        } );

        test( 'with adapter, adapter has no logger',()=>{
            const adapter = new DaumAdapter({},null);
            adapter.logger = undefined;
            const cyclingMode = new ERGCyclingMode(adapter);
            
            expect( cyclingMode.logger.getName() ).toBe('ERGMode');
        } );


    })

    describe ( 'getName()',()=>{
        test('default',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getName() ).toBe( 'ERG' );
        })
    })

    describe ( 'getDescription()',()=>{
        test('default',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getDescription() ).toBe( 'Calculates speed based on power and slope. Power is either set by workout or calculated based on gear and cadence' );
        })

    })

    describe ( 'getProperties()',()=>{
        test('default',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getProperties() ).toEqual( [
                {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'},
                {key:'startPower',name: 'Starting Power', description: 'Initial power in Watts at start of training', type: CyclingModeProperyType.Integer, default: 50, min:25, max:800},
            ])
        })

    })

    describe ( 'getProperty()',()=>{
        test('valid',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getProperty('Starting Power') ).toEqual( 
                {key:'startPower',name: 'Starting Power', description: 'Initial power in Watts at start of training', type: CyclingModeProperyType.Integer, default: 50,min:25, max:800} 
            )
        })

    })

    describe ( 'getSetting()',()=>{
        test('default value',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getSetting('startPower') ).toBe(50)
        })
        test('value explictly set',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getSetting('test') ).toBe(true)
        })
        test('key not found',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getSetting('xyz') ).toBeUndefined()
        })

    })

    describe ( 'setSetting()',()=>{
        test('overwrite default value',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            cyclingMode.setSetting('startPower',100)
            expect( cyclingMode.getSetting('startPower') ).toBe(100)
        })
        test('non existing value',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.setSetting('xyz',100)
            expect( cyclingMode.getSetting('xyz') ).toBe(100)
        })
        test('existing value: overwrites',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            cyclingMode.setSetting('test',false)
            expect( cyclingMode.getSetting('test') ).toBe(false)
        })

    })

    describe ( 'getBikeInitRequest()',()=>{
        test('default',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter); 
            const request = cyclingMode.getBikeInitRequest();
            expect( request ).toEqual( { targetPower: 50})
        })
        test('startPower set',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter); 
            cyclingMode.getSetting = jest.fn( ()=> 110 );
            const request = cyclingMode.getBikeInitRequest();
            expect( request ).toEqual( { targetPower: 110})
        })
    })

    describe('updateData',()=>{
        // only edge cases are tested here. The test coverage is achieved in the Adapter test
        test('no gear',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter);
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,power: 100,slope: 0,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.gear).toBe(0)
        })

        test('no slope, first request',()=>{
            const adapter = new DaumAdapter({userWeight:80, bikeWeight:10},null);
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.prevRequest = undefined
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(0)
        })

        test('no slope, slope was set before',()=>{
            const adapter = new DaumAdapter({userWeight:80, bikeWeight:10},null);
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.data.slope = 2;
            cyclingMode.prevRequest = undefined
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(2)
        })

        test('contains slope, will be ignored',()=>{
            const adapter = new DaumAdapter({userWeight:80, bikeWeight:10},null);
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.data.slope = 2;
            cyclingMode.prevRequest = undefined
            // ignores slope if provided by bike
            let res=cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, slope:1, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(2)
        })

        test('no slope, but previous request on slope',()=>{
            const adapter = new DaumAdapter({userWeight:80, bikeWeight:10},null);
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.prevRequest = {slope: 2}
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(2)
        })

    })

    describe('calculateTargetPower',()=> {

        let cm;
        beforeEach(()=>{
            const adapter = new DaumAdapter({},null);
            adapter.getWeight = jest.fn().mockReturnValue(85);
            cm = new ERGCyclingMode(adapter);
        });

        describe('very first run',()=>{
            test('empty request: will set targetPower to "startPower" setting',()=>{
                cm.data = undefined;

                expect( cm.calculateTargetPower({}) ).toEqual(50);
            })
            test('targetPower not set: will set targetPower to "startPower" setting, remove slope',()=>{
                cm.data = undefined;
                cm.setSetting('startPower',75);
                expect( cm.calculateTargetPower({slope:10}) ).toEqual( 75);
            })
            
            test('targetPower is set: use value from request',()=>{
                cm.data = undefined;
                expect( cm.calculateTargetPower({targetPower:100}) ).toEqual(100);
            })
    
        })

        
        describe('subsequent runs',()=>{
            test('empty request: will set targetPower based on gear,cadence and weight',()=>{
                cm.data = {pedalRpm:90, gear:10}
                
                let res;
                res = cm.calculateTargetPower({});
                expect(res  ).toBeCloseTo(146,0);

                cm.adapter.getWeight = jest.fn().mockReturnValue(90);
                res = cm.calculateTargetPower({});
                expect(res  ).toBeCloseTo(147,0);

            })
            test('targetPower not set: will set targetPower according to gear and cadence ',()=>{
                cm.data = {pedalRpm:90, gear:10}
                const res = cm.calculateTargetPower({slope:5});
                expect(res  ).toBeCloseTo(146,0);
                


            })
            
            test('not pedalling: will set targetPower to initial setting',()=>{
                cm.data = {pedalRpm:0, gear:10}
                const res = cm.calculateTargetPower({slope:5});
                expect(res  ).toBeCloseTo(50,0);
            })


            test('no gear:  will set targetPower to initial setting',()=>{
                cm.data = {pedalRpm:90, gear:0}
                
                const res = cm.calculateTargetPower({slope:5});
                expect(res  ).toBeCloseTo(50,0);
            })
    
        })
    })

    describe('sendBikeUpdate',()=>{
        // only edge cases are tested here. The test coverage is achieved in the Adapter test

        beforeAll( () => {
            jest.useFakeTimers();
        })
        afterAll( () => {
            jest.useRealTimers();
        })



        test('starting',()=>{
            const adapter = new DaumAdapter({},null);
            const cm = new ERGCyclingMode(adapter);
            cm.getSetting = jest.fn( (key) => { 
                if (key==='startPower') return 100
                if (key==='bikeType') return 'race'
            });

            let res;
            cm.prevRequest = undefined;
            cm.data = {} as any;
            res = cm.sendBikeUpdate({ refresh:true})
            expect(res).toEqual({targetPower:100})

            jest.advanceTimersByTime(1000);
            res = cm.updateData({time:0,slope:0,speed:3,isPedalling:true,power:100,distanceInternal:0,pedalRpm:11,heartrate:216,gear:10})

            res = cm.sendBikeUpdate({ refresh:true})
            res = expect(res).toEqual({});


            
        })

        test('slope change',()=>{
            const adapter = new DaumAdapter({},null);
            const cm = new ERGCyclingMode(adapter);
            cm.getSetting = jest.fn( (key) => { 
                if (key==='startPower') return 100
                if (key==='bikeType') return 'race'
            });

            cm.prevRequest = {};
            cm.data = {speed:40,slope:0,power:158,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:10,gear:10,time:1220.219};
            cm.prevUpdateTS = Date.now()

            jest.advanceTimersByTime(1000);
            cm.updateData({speed:30,slope:0,power:158,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:242351,gear:10,time:1626})
            expect(cm.data.speed).toBeCloseTo(39.4,1)
            
            cm.sendBikeUpdate({slope:-2.798902988433838})
            jest.advanceTimersByTime(1000);
            cm.updateData({speed:50,slope:0,power:158,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:242351,gear:10,time:1626})
            expect(cm.data.speed).toBeGreaterThan(39.4)

            cm.sendBikeUpdate({slope:0})
            jest.advanceTimersByTime(1000);
            cm.updateData({speed:60,slope:0,power:158,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:242351,gear:10,time:1626})
            expect(cm.data.speed).toBeCloseTo(39.2,1)

            cm.sendBikeUpdate({slope:1})
            jest.advanceTimersByTime(1000);
            cm.updateData({speed:870,slope:0,power:158,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:242351,gear:10,time:1626})
            expect(cm.data.speed).toBeLessThan(39.4)
        })

        test('slope change with triathlon',()=>{
            const adapter = new DaumAdapter({},null);
            const cm = new ERGCyclingMode(adapter);
            cm.getSetting = jest.fn( (key) => { 
                if (key==='startPower') return 100
                if (key==='bikeType') return 'triathlon'
            });

            let res;
            cm.prevRequest = {};
            cm.data = {speed:30,power:100} as any;
            cm.prevUpdateTS = Date.now()

            jest.advanceTimersByTime(1000);
            res = cm.updateData({speed:30,slope:0,power:158,isPedalling:false,pedalRpm:0,heartrate:99,distanceInternal:242351,gear:10,time:1626})


            res = cm.sendBikeUpdate({slope:-2.798902988433838})
            jest.advanceTimersByTime(1000);
            res = cm.updateData({speed:30,slope:0,power:100,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:242351,gear:10,time:1626})
            // TODO:understand what should be expected here ( 100W vs 138W -- 26.5km/h vs 31.5km/h)
            //expect(cm.data.speed).toBeCloseTo(26.5,1)
            
            res = cm.sendBikeUpdate({slope:-2.798902988433838})
            jest.advanceTimersByTime(1000);
            res = cm.updateData({speed:50,slope:0,power:res.targetPower,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:242351,gear:10,time:1626})
            expect(cm.data.speed).toBeGreaterThan(31.2)

            res = cm.sendBikeUpdate({slope:0})
            jest.advanceTimersByTime(1000);
            res = cm.updateData({speed:60,slope:0,power:158,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:242351,gear:10,time:1626})
            expect(cm.data.speed).toBeCloseTo(31.4,1)

            res = cm.sendBikeUpdate({slope:1})
            jest.advanceTimersByTime(1000);
            res = cm.updateData({speed:870,slope:0,power:158,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:242351,gear:10,time:1626})
            expect(cm.data.speed).toBeLessThan(31.5)
        })



        test('rpm change',()=>{
            const adapter = new DaumAdapter({},null);
            const cm = new ERGCyclingMode(adapter);
            cm.getSetting = jest.fn( (key) => { 
                if (key==='startPower') return 100
                if (key==='bikeType') return 'race'
            });

            let res;
            cm.prevRequest = {};
            cm.event = {}
            cm.data = {speed:40,slope:0,power:158,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:10,gear:10,time:1220.219};
            cm.prevUpdateTS = Date.now()

            // increase cadence -> target power will increase & speed will increase once bike has adjusted power
            jest.advanceTimersByTime(1000);
            cm.updateData({speed:30,slope:0,power:158,isPedalling:true,pedalRpm:91,heartrate:99,distanceInternal:242351,gear:10,time:1626} )  
            expect(cm.event.rpmUpdated).toBe(true)         
            expect(cm.data.speed).toBeCloseTo(39.4,1)
            res = cm.sendBikeUpdate({refresh:true})
            expect(res.targetPower).toBeCloseTo(150,0)
            
            // back to previous will also reset speed and power
            jest.advanceTimersByTime(1000);
            cm.updateData({speed:30,slope:0,power:res.targetPower,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:242351,gear:10,time:1626} )  
            expect(cm.data.speed).toBeCloseTo(38.8,1)
            expect(cm.event.rpmUpdated).toBe(true)         
            res = cm.sendBikeUpdate({refresh:true})
            expect(res.targetPower).toBe(146)

            // decrease cadence -> target power will decrease & speed will decrease once bike has adjusted power
            jest.advanceTimersByTime(1000);
            cm.updateData({speed:30,slope:0,power:158,isPedalling:true, pedalRpm:89,heartrate:99,distanceInternal:242351,gear:10,time:1626} )  
            expect(cm.data.speed).toBeCloseTo(38.3,1)
            expect(cm.event.rpmUpdated).toBe(true)         
            res = cm.sendBikeUpdate({refresh:true})
            expect(res.targetPower).toBeLessThan(158)
            jest.advanceTimersByTime(1000);
            cm.updateData({speed:30,slope:0,power:res.targetPower,isPedalling:true, pedalRpm:89,heartrate:99,distanceInternal:242351,gear:10,time:1626} )  
            expect(cm.data.speed).toBeCloseTo(37.7,1)
            expect(cm.event.rpmUpdated).toBeUndefined()

            // decrease cadence to zero, speed will not be immediately set to zero, sets target to "startPower"
            jest.advanceTimersByTime(1000);
            cm.updateData({speed:30,slope:0,power:158,isPedalling:false, pedalRpm:0,heartrate:99,distanceInternal:242351,gear:10,time:1626} )  
            expect(cm.data.speed).not.toBe(0)
            res = cm.sendBikeUpdate({refresh:true})
            expect(res.targetPower).toBe( cm.getSetting('startPower') )
        })

    })

})