import ERGCyclingMode from "./ERGCyclingMode";
import { CyclingModeProperyType } from "../../CyclingMode";
import KettlerAdapter from './adapter'
import KettlerRacerProtocol from "./protocol";
import { EventLogger } from "gd-eventlog";
import { MockLogger } from "../../../test/logger";
import { DeviceProtocol } from "../../DeviceProtocol";

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

describe( 'ERGCyclingMode',()=>{
    let protocol: DeviceProtocol
    beforeAll( ()=> {
        protocol = new KettlerRacerProtocol()
        
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( MockLogger)

    })

    describe ( 'constructor()',()=>{
        test( 'only adapter provided',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
            const cyclingMode = new ERGCyclingMode(adapter);
            
            expect( cyclingMode.adapter ).toBe( adapter );
            expect( cyclingMode.logger ).toBeDefined();
            expect( cyclingMode.settings ).toEqual({});
        } );

        test( 'with adapter and settings',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            
            expect( cyclingMode.adapter ).toBe( adapter );
            expect( cyclingMode.logger ).toBeDefined();
            expect( cyclingMode.settings['test'] ).toBeTruthy();
        } );



    })

    describe ( 'getName()',()=>{
        test('default',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getName() ).toBe( 'ERG' );
        })
    })

    describe ( 'getDescription()',()=>{
        test('default',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getDescription() ).toBe( 'Calculates speed based on power and slope. Power is either set by a workout' );
        })

    })

    describe ( 'getProperties()',()=>{
        test('default',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getProperties() ).toEqual( [
                {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'},
                {key:'startPower',name: 'Starting Power', description: 'Initial power in Watts at start of training', type: CyclingModeProperyType.Integer, default: 50, min:25, max:800},
            ])
        })

    })

    describe ( 'getProperty()',()=>{
        test('valid',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getProperty('Starting Power') ).toEqual( 
                {key:'startPower',name: 'Starting Power', description: 'Initial power in Watts at start of training', type: CyclingModeProperyType.Integer, default: 50,min:25, max:800} 
            )
        })

    })

    describe ( 'getSetting()',()=>{
        test('default value',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getSetting('startPower') ).toBe(50)
        })
        test('value explictly set',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getSetting('test') ).toBe(true)
        })
        test('key not found',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getSetting('xyz') ).toBeUndefined()
        })

    })

    describe ( 'setSetting()',()=>{
        test('overwrite default value',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            cyclingMode.setSetting('startPower',100)
            expect( cyclingMode.getSetting('startPower') ).toBe(100)
        })
        test('non existing value',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.setSetting('xyz',100)
            expect( cyclingMode.getSetting('xyz') ).toBe(100)
        })
        test('existing value: overwrites',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            cyclingMode.setSetting('test',false)
            expect( cyclingMode.getSetting('test') ).toBe(false)
        })

    })

    describe ( 'getBikeInitRequest()',()=>{
        test('default',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
            const cyclingMode = new ERGCyclingMode(adapter); 
            const request = cyclingMode.getBikeInitRequest();
            expect( request ).toEqual( { targetPower: 50})
        })
        test('startPower set',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
            const cyclingMode = new ERGCyclingMode(adapter); 
            cyclingMode.getSetting = jest.fn( ()=> 110 );
            const request = cyclingMode.getBikeInitRequest();
            expect( request ).toEqual( { targetPower: 110})
        })
    })

    describe('updateData',()=>{
        // only edge cases are tested here. The test coverage is achieved in the Adapter test

        test('no slope, first request',()=>{
            
            const adapter = new KettlerAdapter(protocol,{name:'test', userSettings:{weight:80}, bikeSettings:{weight:10}});
            const cyclingMode = new ERGCyclingMode(adapter);
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(0)
        })

        test('no slope, slope was set before',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test', userSettings:{weight:80}, bikeSettings:{weight:10}});
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.data.slope = 2;
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(2)
        })

        test('contains slope, will be ignored',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test', userSettings:{weight:80}, bikeSettings:{weight:10}});
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.data.slope = 2;
            // ignores slope if provided by bike
            let res=cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, slope:1, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(2)
        })

        test('no slope, but previous request on slope',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test', userSettings:{weight:80}, bikeSettings:{weight:10}});
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.prevRequest = {slope: 2}
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(2)
        })

    })

    describe('sendBikeUpdate',()=>{

        beforeAll( () => {
            jest.useFakeTimers();
        })
        afterAll( () => {
            jest.useRealTimers();
        })



        test('starting',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
            const cm = new ERGCyclingMode(adapter);
            cm.getSetting = jest.fn( (key) => { 
                if (key==='startPower') return 100
                if (key==='bikeType') return 'race'
            });

            let res;
            cm.data = {} as any;
            res = cm.sendBikeUpdate({ refresh:true})
            expect(res).toEqual({targetPower:100})

            jest.advanceTimersByTime(1000);
            res = cm.updateData({time:0,slope:0,speed:3,isPedalling:true,power:100,distanceInternal:0,pedalRpm:11,heartrate:216,gear:10})

            res = cm.sendBikeUpdate({ refresh:true})
            res = expect(res).toEqual({});


            
        })

        test('slope change',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
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
            const adapter = new KettlerAdapter(protocol,{name:'test'});
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
            expect(res.speed).toBeGreaterThan(31.2)

            res = cm.sendBikeUpdate({slope:0})
            jest.advanceTimersByTime(1000);
            res = cm.updateData({speed:60,slope:0,power:158,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:242351,gear:10,time:1626})
            expect(res.speed).toBeCloseTo(31.4,1)

            res = cm.sendBikeUpdate({slope:1})
            jest.advanceTimersByTime(1000);
            res = cm.updateData({speed:870,slope:0,power:158,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:242351,gear:10,time:1626})
            expect(res.speed).toBeLessThan(31.5)
        })



        test('rpm change',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
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

            // increase cadence -> target power will not change
            jest.advanceTimersByTime(1000);
            cm.updateData({speed:30,slope:0,power:158,isPedalling:true,pedalRpm:91,heartrate:99,distanceInternal:242351,gear:10,time:1626} )  
            expect(cm.data.speed).toBeCloseTo(39.4,1)
            res = cm.sendBikeUpdate({refresh:true})
            expect(res.targetPower).toBeUndefined()        
        })

        test('min power < max power',()=>{
            const adapter = new KettlerAdapter(protocol,{name:'test'});
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

            // increase cadence -> target power will not change
            jest.advanceTimersByTime(1000);
            cm.updateData({speed:30,slope:0,power:158,isPedalling:true,pedalRpm:91,heartrate:99,distanceInternal:242351,gear:10,time:1626} )  
            expect(cm.data.speed).toBeCloseTo(39.4,1)
            res = cm.sendBikeUpdate({minPower:120, maxPower:140})
            expect(res.targetPower).toBe(140)
            
        })



    })

})