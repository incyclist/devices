import SmartTrainerCyclingMode, { direction } from "./SmartTrainerCyclingMode";
import { CyclingModeProperyType } from "../../modes/cycling-mode";
import DaumAdapter from './DaumAdapter'
import { EventLogger } from "gd-eventlog";
import { MockLogger } from "../../../test/logger";


if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

    const DEFAULT_SETTINGS = {interface:'mock', protocol:'serial'}

describe( 'SmartTrainerCyclingMode',()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( MockLogger)

    })

    describe ( 'constructor()',()=>{

        let adapter
        beforeEach( ()=>{
            adapter = new DaumAdapter(DEFAULT_SETTINGS);
        })

        test( 'only adapter provided',()=>{
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            
            expect( cyclingMode.adapter ).toBe( adapter );
            expect( cyclingMode.logger ).toBeDefined();
            expect( cyclingMode.settings ).toEqual({});
        } );

        test( 'with adapter and settings',()=>{
            const cyclingMode = new SmartTrainerCyclingMode(adapter, { test:true } );
            
            expect( cyclingMode.adapter ).toBe( adapter );
            expect( cyclingMode.logger ).toBeDefined();
            expect( cyclingMode.settings['test'] ).toBeTruthy();
        } );

        test( 'with adapter, adapter has no logger',()=>{
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            
            expect( cyclingMode.logger.getName() ).toBe('SmartTrainer');
        } );

        test( 'with adapter, adapter has a logger',()=>{
            adapter.getLogger = jest.fn().mockReturnValue(MockLogger);
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            
            expect( cyclingMode.logger.getName() ).toBe('mock');
        } );


    })

    describe ( 'getName()',()=>{
        test('default',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getName() ).toBe( 'SmartTrainer' );
        })
    })

    describe ( 'getDescription()',()=>{
        test('default',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getDescription() ).toBe( 'Calculates power based on speed and slope.' );
        })

    })

    describe.skip ( 'getProperties()',()=>{
        test('default',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getProperties() ).toEqual( [
                {key:'startPower',name: 'Starting Power', description: 'Starting power in watts', type: CyclingModeProperyType.Integer, default: 50} 
            ])
        })

    })

    describe.skip ( 'getProperty()',()=>{
        test('valid',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getProperty('Starting Power') ).toEqual( 
                {key:'startPower',name: 'Starting Power', description: 'Starting power in watts', type: CyclingModeProperyType.Integer, default: 50} 
            )
        })

    })


    describe.skip ( 'getBikeInitRequest()',()=>{
        test('default',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter); 
            const request = cyclingMode.getBikeInitRequest();
            expect( request ).toEqual( { targetPower: 50})
        })
        test('startPower set',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter); 
            cyclingMode.getSetting = jest.fn( ()=> 110 );
            const request = cyclingMode.getBikeInitRequest();
            expect( request ).toEqual( { targetPower: 110})
        })
    })

    describe('updateData',()=>{
        // only edge cases are tested here. The test coverage is achieved in the Adapter test
        test('no gear',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,power: 100,slope: 0,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.gear).toBe(0)
        })

        test('bug:weird speed change',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            cyclingMode.setSettings({ chainRings: "36-52",cassetteRings: "11-30"})

            cyclingMode.prevRequest = {enforced:true,targetPower:50}
            cyclingMode.data ={speed:0,slope:0,power:0,isPedalling:false,pedalRpm:0,heartrate:227,distanceInternal:0,time:1,gear:10} 
            cyclingMode.updateData({speed:0,slope:0,power:50,isPedalling:false,pedalRpm:0,heartrate:227,distanceInternal:0,time:1,gear:10})

            cyclingMode.prevRequest = {enforced:true,targetPower:50}
            cyclingMode.updateData({speed:11,slope:0,power:50, isPedalling:true,pedalRpm:34,heartrate:226,distanceInternal:0,time:2,gear:10})

            cyclingMode.prevRequest = {enforced:true,targetPower:50}
            const res = cyclingMode.updateData({speed:11,slope:0,power:50,isPedalling:true,pedalRpm:34,heartrate:226,distanceInternal:0,time:2,gear:10})


            expect(res.speed).toBeCloseTo(19.5,1)
        })

        test('start pedaling',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            cyclingMode.setSettings({ chainRings: "36-52",cassetteRings: "11-30"})

            let res;
            cyclingMode.prevRequest = {targetPower:110,calculatedPower:50,delta:-90}
            cyclingMode.data = {speed:28.1,slope:-3.688091383243849,power:140, isPedalling:true,pedalRpm:88,heartrate:205,distanceInternal:611,time:79,gear:11}
            cyclingMode.data.slope = -3.839372652415326
            res = cyclingMode.updateData({speed:30,slope:-3.839372652415326,power:135, isPedalling:true,pedalRpm:89,heartrate:205,distanceInternal:0.7,time:81,gear:11})

            res = cyclingMode.sendBikeUpdate({slope:-4.0313720703125 });
            res = cyclingMode.sendBikeUpdate({slope:-4.121568467882334});
            
            res = cyclingMode.updateData({speed:30,slope:-4.0313720703125,power:135,  isPedalling:true,pedalRpm:89,heartrate:205,distanceInternal:0.7,time:81,gear:11})
            res = cyclingMode.sendBikeUpdate({slope:-4.121568467882334});
            
            res = cyclingMode.updateData({speed:32,slope:-1.0829544067373067,power:50,  isPedalling:true,pedalRpm:97,heartrate:202,distanceInternal:0,time:3,gear:10})
            
            console.log(res)


            
        })

        test.skip('bug:weird power change',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            cyclingMode.setSettings({ chainRings: "36-52",cassetteRings: "11-30"})

            cyclingMode.prevRequest = {}
            cyclingMode.data ={speed:32.5,slope:-0.49999371170997614,power:55,isPedalling:true,pedalRpm:94,heartrate:212,distanceInternal:94,time:13,gear:12}
            cyclingMode.event={gearUpdate: direction.up}
            const res = cyclingMode.sendBikeUpdate({slope:-0.4999937862157822})


            expect(res.targetPower).toBeCloseTo(106,0)
        })

        test.skip('bug:power set to NaN',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            cyclingMode.setSettings({ chainRings: "36-52",cassetteRings: "11-30"})

            cyclingMode.prevRequest = {targetPower:183.60579725568576}
            cyclingMode.event={targetNotReached:1}

            cyclingMode.updateData({speed:31,slope:0.7999742031097412,power:185,isPedalling:true,pedalRpm:89,heartrate:204,distanceInternal:0.2,time:28,gear:12})         
            cyclingMode.sendBikeUpdate({slope:0.5999895930290222})

            cyclingMode.updateData({speed:31,slope:0.5999895930290222,power:180,isPedalling:true,pedalRpm:88,heartrate:204,distanceInternal:0.2,time:29,gear:12})         
            cyclingMode.sendBikeUpdate({slope:0.5999886989593506})

            cyclingMode.event={targetNotReached:1}
            cyclingMode.updateData({speed:31,slope:0.5999886989593506,power:180, isPedalling:true,pedalRpm:88,heartrate:206,distanceInternal:0.2,time:30,gear:12})         
            cyclingMode.sendBikeUpdate({refresh:true})
            

            
        })

        test.skip('bug:weird result after slope change',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            cyclingMode.setSettings({ chainRings: "36-52",cassetteRings: "11-30"})

            cyclingMode.prevRequest = {}
            cyclingMode.data ={speed:15.1,slope:3.697476387023926,power:150,isPedalling:true,pedalRpm:81,heartrate:214,distanceInternal:711,time:97,gear:3}
            cyclingMode.event={rpmUpdate:true}
            const res = cyclingMode.sendBikeUpdate({slope:0.3999900817871094})


            expect(res.targetPower).toBeCloseTo(106,0)
        })


        test('slope change: target Power is achieved after 3s',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            cyclingMode.setSettings({ chainRings: "36-52",cassetteRings: "11-30"})

            cyclingMode.prevRequest = {}
            cyclingMode.data ={speed:15.1,slope:4,power:179,isPedalling:true,pedalRpm:81,heartrate:214,distanceInternal:711,time:97,gear:3}
            cyclingMode.event={rpmUpdate:true}
            const res1 = cyclingMode.sendBikeUpdate({slope:0})
            expect(res1.delta).toBeDefined()
            expect(cyclingMode.event.targetNotReached).toBe(1)
            expect(res1.belowMin).toBeFalsy()
            const res2 = cyclingMode.sendBikeUpdate({refresh:true})
            expect(res2.delta).toBeDefined()
            expect(cyclingMode.event.targetNotReached).toBe(2)
            const res3 = cyclingMode.sendBikeUpdate({refresh:true})
            expect(res3.delta).toBeUndefined()
            expect(res3.targetPower).toBeCloseTo(res1.calculatedPower as number,0)
            expect(res3.belowMin).toBeTruthy()
            expect(cyclingMode.event.targetNotReached).toBeUndefined()          
        })


        // TODO: fix
        test.skip('if power is below minPower, flag ist set in request',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            cyclingMode.setSettings({ chainRings: "36-52",cassetteRings: "11-30"})

            let res;
            let speed;
            cyclingMode.prevRequest = {targetPower:50}
            cyclingMode.data = {power:0,isPedalling:false,pedalRpm:0,speed:0,heartrate:0,distanceInternal:0};
            cyclingMode.updateData({speed:30,slope:-2.8,power:50,  isPedalling:true,pedalRpm:90,heartrate:223,distanceInternal:0,time:0,gear:10})
            speed = cyclingMode.data.speed;
            res = cyclingMode.sendBikeUpdate({slope:-2.8})
            expect(res.belowMin).toBeTruthy()
            
            cyclingMode.updateData({speed:30,slope:-2.8,power:50,  isPedalling:true,pedalRpm:90,heartrate:223,distanceInternal:0,time:0,gear:10})
            expect(cyclingMode.data.speed>speed).toBeTruthy()
            speed = cyclingMode.data.speed; 
            res = cyclingMode.sendBikeUpdate({refresh:true})

            cyclingMode.updateData({speed:30,slope:-2.8,power:50,  isPedalling:true,pedalRpm:90,heartrate:223,distanceInternal:0,time:0,gear:10})
            expect(cyclingMode.data.speed>speed).toBeTruthy()
            speed = cyclingMode.data.speed; 
            res = cyclingMode.sendBikeUpdate({refresh:true})

        })

        test('slope change, followed by another slope change',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            cyclingMode.setSettings({ chainRings: "36-52",cassetteRings: "11-30"})

            cyclingMode.prevRequest = {}
            cyclingMode.data ={speed:15.1,slope:4,power:179,isPedalling:true,pedalRpm:81,heartrate:214,distanceInternal:711,time:97,gear:3}
            cyclingMode.event={rpmUpdate:true}
            const res1 = cyclingMode.sendBikeUpdate({slope:0})
            expect(res1.delta).toBeDefined()
            expect(cyclingMode.event.targetNotReached).toBe(1)
            cyclingMode.data.slope = 0;

            const res2 = cyclingMode.sendBikeUpdate({refresh:true})
            expect(res2.delta).toBeDefined()
            expect(cyclingMode.event.targetNotReached).toBe(2)
            cyclingMode.data.power = res2.targetPower as number

            const res3 = cyclingMode.sendBikeUpdate({slope:1})
            expect(res3.delta).toBeDefined()
            expect(cyclingMode.event.targetNotReached).toBe(1)
        })

        test('slope change up, followed by gear change down',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            cyclingMode.setSettings({ chainRings: "36-52",cassetteRings: "11-30"})

            cyclingMode.prevRequest = {}
            cyclingMode.data ={speed:24,slope:1,power:179,isPedalling:true,pedalRpm:81,heartrate:214,distanceInternal:711,time:97,gear:10}
            cyclingMode.event={rpmUpdate:true}
            const res1 = cyclingMode.sendBikeUpdate({slope:3})
            expect(res1.delta).toBeDefined() // calculated: 255, target::205
            expect(cyclingMode.event.targetNotReached).toBe(1)
            cyclingMode.data.slope = 3;

            const res2 = cyclingMode.sendBikeUpdate({refresh:true})
            expect(res2.delta).toBeDefined()
            expect(cyclingMode.event.targetNotReached).toBe(2) // calculated: 255, target::230
            
            // simulate bike response with gear change (incl. prev power and slope)
            cyclingMode.updateData({speed:15.1,slope:0,power:res2.targetPower as number,isPedalling:true,pedalRpm:81,heartrate:214,distanceInternal:711,time:97,gear:5})

            cyclingMode.sendBikeUpdate({refresh:true}) // target:223
            expect(cyclingMode.event.targetNotReached).toBeUndefined()
        })




        test('no slope, first request',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS,{userWeight:80, bikeWeight:10});
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            cyclingMode.data = undefined

            cyclingMode.prevRequest = undefined
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(0)
        })

        test('no slope, subsequent requests',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS,{userWeight:80, bikeWeight:10});
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            cyclingMode.data = undefined
            cyclingMode.prevRequest = undefined
            cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, slope:1, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(0) // slope from bike is ignored
        })

        test('no slope, but previous request on slope',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS,{userWeight:80, bikeWeight:10});
            const cyclingMode = new SmartTrainerCyclingMode(adapter);
            cyclingMode.data = undefined
            cyclingMode.prevRequest = {slope: 2}
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(2)
        })

    })

    describe.skip('calculateTargetPower',()=> {

        let cm;
        beforeEach(()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            adapter.getWeight = jest.fn().mockReturnValue(85);
            cm = new SmartTrainerCyclingMode(adapter);
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