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

    })

    describe ( 'getName()',()=>{
        test('default',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getName() ).toBe( 'Ergometer mode' );
        })
    })

    describe ( 'getDescription()',()=>{
        test('default',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getDescription() ).toBe( 'Calculates speed based on power and slope. Power is calculated from gear and cadence' );
        })

    })

    describe ( 'getProperties()',()=>{
        test('default',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getProperties() ).toEqual( [
                {key:'startPower',name: 'Starting Power', description: 'Starting power in watts', type: CyclingModeProperyType.Integer, default: 50} 
            ])
        })

    })

    describe ( 'getProperty()',()=>{
        test('valid',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getProperty('Starting Power') ).toEqual( 
                {key:'startPower',name: 'Starting Power', description: 'Starting power in watts', type: CyclingModeProperyType.Integer, default: 50} 
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

    describe('updateData',()=>{
        // only edge cases are tested here. The test coverage is achieved in the Adapter test
        test('no gear',()=>{
            const adapter = new DaumAdapter({},null);
            const cyclingMode = new ERGCyclingMode(adapter);
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,power: 100,slope: 0,distance: 0,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.gear).toBe(0)
        })

        test('no slope, first request',()=>{
            const adapter = new DaumAdapter({userWeight:80, bikeWeight:10},null);
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.prevData = undefined
            cyclingMode.prevRequest = undefined
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, power: 100,distance: 0,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(0)
        })

        test('no slope, subsequent requests',()=>{
            const adapter = new DaumAdapter({userWeight:80, bikeWeight:10},null);
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.prevData = undefined
            cyclingMode.prevRequest = undefined
            cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, slope:1, power: 100,distance: 0,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, power: 100,distance: 0,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(1)
        })

        test('no slope, but previous request on slope',()=>{
            const adapter = new DaumAdapter({userWeight:80, bikeWeight:10},null);
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.prevData = undefined
            cyclingMode.prevRequest = {slope: 2}
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, power: 100,distance: 0,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
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
                cm.prevData = undefined;

                expect( cm.calculateTargetPower({}) ).toEqual({targetPower:50});
            })
            test('targetPower not set: will set targetPower to "startPower" setting, remove slope',()=>{
                cm.prevData = undefined;
                cm.setSetting('startPower',75);
                expect( cm.calculateTargetPower({slope:10}) ).toEqual({targetPower:75});
            })
            
            test('targetPower is set: use value from request',()=>{
                cm.prevData = undefined;
                expect( cm.calculateTargetPower({targetPower:100}) ).toEqual({targetPower:100});
            })
    
        })

        
        describe('subsequent runs',()=>{
            test('empty request: will set targetPower based on gear,cadence and weight',()=>{
                cm.prevData = {pedalRpm:90, gear:10}
                
                const res = cm.calculateTargetPower({});
                expect(res.targetPower  ).toBeCloseTo(124,0);

                cm.adapter.getWeight = jest.fn().mockReturnValue(90);
                const res1 = cm.calculateTargetPower({});
                expect(res1.targetPower  ).toBeCloseTo(125,0);

            })
            test('targetPower not set: will set targetPower to "startPower" setting, remove slope',()=>{
                cm.prevData = {pedalRpm:90, gear:10}
                const res = cm.calculateTargetPower({slope:5});
                expect(res.targetPower  ).toBeCloseTo(124,0);
                expect(res.slope  ).toBeUndefined();


            })
            
            test('not pedalling: will set targetPower to "startPower" setting',()=>{
                cm.prevData = {pedalRpm:0, gear:10}
                const res = cm.calculateTargetPower({slope:5});
                expect(res.targetPower  ).toBeCloseTo(50,0);
            })

            test('not pedalling, updateMode=false: will set targetPower to "startPower" setting',()=>{
                cm.prevData = {pedalRpm:0, gear:10}
                const res = cm.calculateTargetPower({slope:5},false);
                expect(res.targetPower  ).toBeCloseTo(0,0);
            })

            test('no gear: will set targetPower to "startPower" setting',()=>{
                cm.prevData = {pedalRpm:90, gear:0}
                cm.prevData = undefined;
                const res = cm.calculateTargetPower({slope:5});
                expect(res.targetPower  ).toBeCloseTo(50,0);
            })
    
        })
    })


})