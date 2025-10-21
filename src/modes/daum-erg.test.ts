import { CyclingModeProperyType } from "./types";
import DaumAdapter from '../serial/daum/DaumAdapter'
import { EventLogger } from "gd-eventlog";
import { MockLogger } from "../../test/logger";
import ERGCyclingMode from "./daum-erg";
import { SerialDeviceSettings } from "../serial/types";
import { DeviceProperties } from "../types";
import { DaumSerialComms } from "../serial/daum/types";

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

const DEFAULT_SETTINGS = {interface:'mock', protocol:'serial'}

describe( 'ERGCyclingMode',()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( MockLogger)

    })

    test('supports ERG',()=>{
        expect(ERGCyclingMode.supportsERGMode()).toBe(true)        
    })

    describe ( 'constructor()',()=>{

        let adapter: DaumAdapter<SerialDeviceSettings, DeviceProperties, DaumSerialComms>;

        const removeLogger = ( a:any) => { 
            a.logger = undefined;
        }

        beforeEach( ()=>{
            adapter = new DaumAdapter(DEFAULT_SETTINGS);
        })

        test( 'only adapter provided',()=>{
            
            const cyclingMode = new ERGCyclingMode(adapter);
            
            expect( cyclingMode.adapter ).toBe( adapter );
            expect( cyclingMode.logger ).toBeDefined();
            expect( cyclingMode.settings ).toEqual({});
        } );

        test( 'with adapter and settings',()=>{
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            
            expect( cyclingMode.adapter ).toBe( adapter );
            expect( cyclingMode.logger ).toBeDefined();
            expect( cyclingMode.settings['test'] ).toBeTruthy();
        } );

        test( 'with adapter, adapter has no logger',()=>{
            removeLogger(adapter)
            const cyclingMode = new ERGCyclingMode(adapter);
            
            expect( cyclingMode.logger.getName() ).toBe('ERGMode');
        } );


    })

    describe ( 'getName()',()=>{
        test('default',()=>{

            const adapter = new DaumAdapter(DEFAULT_SETTINGS);

            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getName() ).toBe( 'ERG' );
        })
    })

    describe ( 'getDescription()',()=>{
        test('default',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getDescription() ).toBe( 'Calculates speed based on power and slope. Power is either set by workout or calculated based on gear and cadence' );
        })

    })

    describe ( 'getProperties()',()=>{
        test('default',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getProperties() ).toEqual( [
                {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'},
                {key:'startPower',name: 'Starting Power', description: 'Initial power in Watts at start of training', type: CyclingModeProperyType.Integer, default: 50, min:25, max:800},
            ])
        })

    })

    describe ( 'getProperty()',()=>{
        test('valid',()=>{
            const adapter = new DaumAdapter(DEFAULT_SETTINGS);
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getProperty('Starting Power') ).toEqual( 
                {key:'startPower',name: 'Starting Power', description: 'Initial power in Watts at start of training', type: CyclingModeProperyType.Integer, default: 50,min:25, max:800} 
            )
        })

    })

    describe ( 'getSetting()',()=>{
        let adapter:DaumAdapter<SerialDeviceSettings, DeviceProperties,DaumSerialComms>
        beforeEach( ()=>{
            adapter = new DaumAdapter(DEFAULT_SETTINGS);
        })

        test('default value',()=>{
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getSetting('startPower') ).toBe(50)
        })
        test('value explictly set',()=>{
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getSetting('test') ).toBe(true)
        })
        test('key not found',()=>{
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            expect( cyclingMode.getSetting('xyz') ).toBeUndefined()
        })

    })

    describe ( 'setSetting()',()=>{
        let adapter:DaumAdapter<SerialDeviceSettings, DeviceProperties,DaumSerialComms>
        beforeEach( ()=>{
            adapter = new DaumAdapter(DEFAULT_SETTINGS);
        })

        test('overwrite default value',()=>{
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            cyclingMode.setSetting('startPower',100)
            expect( cyclingMode.getSetting('startPower') ).toBe(100)
        })
        test('non existing value',()=>{
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.setSetting('xyz',100)
            expect( cyclingMode.getSetting('xyz') ).toBe(100)
        })
        test('existing value: overwrites',()=>{
            const cyclingMode = new ERGCyclingMode(adapter, { test:true } );
            cyclingMode.setSetting('test',false)
            expect( cyclingMode.getSetting('test') ).toBe(false)
        })

    })

    describe ( 'getBikeInitRequest()',()=>{
        let adapter:DaumAdapter<SerialDeviceSettings, DeviceProperties, DaumSerialComms>
        beforeEach( ()=>{
            adapter = new DaumAdapter(DEFAULT_SETTINGS);
        })

        test('default',()=>{
            const cyclingMode = new ERGCyclingMode(adapter); 
            const request = cyclingMode.getBikeInitRequest();
            expect( request ).toEqual( { targetPower: 50, init:true})
        })
        test('startPower set',()=>{
            const cyclingMode = new ERGCyclingMode(adapter); 
            cyclingMode.getSetting = jest.fn( ()=> 110 );
            const request = cyclingMode.getBikeInitRequest();
            expect( request ).toEqual( { targetPower: 110, init:true})
        })
    })

    describe('updateData',()=>{
        let adapter:DaumAdapter<SerialDeviceSettings, DeviceProperties,DaumSerialComms>
        beforeEach( ()=>{
            adapter = new DaumAdapter(DEFAULT_SETTINGS);
        })
        // only edge cases are tested here. The test coverage is achieved in the Adapter test
        test('no gear',()=>{
            const cyclingMode = new ERGCyclingMode(adapter);
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,power: 100,slope: 0,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.gear).toBe(0)
        })

        test('no slope, first request',()=>{
            adapter = new DaumAdapter(DEFAULT_SETTINGS,{userWeight:80, bikeWeight:10});
            const cyclingMode = new ERGCyclingMode(adapter);
            (cyclingMode as any).prevRequest  = undefined
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(0)
        })

        test('no slope, slope was set before',()=>{
            adapter = new DaumAdapter(DEFAULT_SETTINGS,{userWeight:80, bikeWeight:10});
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.data.slope = 2;
            (cyclingMode as any).prevRequest = undefined
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(2)
        })

        test('contains slope, will be ignored',()=>{
            adapter = new DaumAdapter(DEFAULT_SETTINGS,{userWeight:80, bikeWeight:10});
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.data.slope = 2;
            (cyclingMode as any).prevRequest = undefined
            // ignores slope if provided by bike
            let res=cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, slope:1, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(2)
        })

        test('no slope, but previous request on slope',()=>{
            adapter = new DaumAdapter(DEFAULT_SETTINGS,{userWeight:80, bikeWeight:10});
            const cyclingMode = new ERGCyclingMode(adapter);
            cyclingMode.prevRequest = {slope: 2}
            const res = cyclingMode.updateData({ isPedalling: true,pedalRpm: 100,gear:10, power: 100,distanceInternal: 0,speed: 0,heartrate: 0,time: 100})
            expect(res.slope).toBe(2)
        })

    })

    describe('calculateTargetPower',()=> {

        let cm:ERGCyclingMode;
        let adapter;

        const setupMocks  = (m:any, data:any) => {
            m.adapter.getWeight = jest.fn().mockReturnValue(85);
            m.data = data;
        }

        beforeEach(()=>{
            adapter = new DaumAdapter(DEFAULT_SETTINGS);
            cm = new ERGCyclingMode(adapter);
        });

        describe('very first run',()=>{
            test('empty request: will set targetPower to "startPower" setting',()=>{
                setupMocks(cm, undefined);

                expect( cm.calculateTargetPower({}) ).toEqual(50);
            })
            test('targetPower not set: will set targetPower to "startPower" setting, remove slope',()=>{
                setupMocks(cm, undefined);
                cm.setSetting('startPower',75);
                expect( cm.calculateTargetPower({slope:10}) ).toEqual( 75);
            })
            
            test('targetPower is set: use value from request',()=>{
                setupMocks(cm, undefined);
                expect( cm.calculateTargetPower({targetPower:100}) ).toEqual(100);
            })
    
        })

        
        describe('subsequent runs',()=>{
            test('empty request: will set targetPower based on gear,cadence and weight',()=>{
                setupMocks(cm, {pedalRpm:90, gear:10});
                
                let res;
                res = cm.calculateTargetPower({});
                expect(res  ).toBeCloseTo(146,0);

                cm.adapter.getWeight = jest.fn().mockReturnValue(90);
                res = cm.calculateTargetPower({});
                expect(res  ).toBeCloseTo(147,0);

            })
            test('targetPower not set: will set targetPower according to gear and cadence ',()=>{
                setupMocks(cm, {pedalRpm:90, gear:10});
                const res = cm.calculateTargetPower({slope:5});
                expect(res  ).toBeCloseTo(146,0);
                


            })
            
            test('not pedalling: will set targetPower to initial setting',()=>{
                setupMocks(cm, {pedalRpm:0, gear:10});
                const res = cm.calculateTargetPower({slope:5});
                expect(res  ).toBeCloseTo(50,0);
            })


            test('no gear:  will set targetPower to initial setting',()=>{
                setupMocks(cm, {pedalRpm:90, gear:0});
                
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
        let adapter:DaumAdapter<SerialDeviceSettings, DeviceProperties,DaumSerialComms>
        beforeEach( ()=>{
            adapter = new DaumAdapter(DEFAULT_SETTINGS);
        })



        test('starting',()=>{
            const cm = new ERGCyclingMode(adapter);
            cm.getSetting = jest.fn( (key) => { 
                if (key==='startPower') return 100
                if (key==='bikeType') return 'race'
            });

            let res;
            (cm as any).prevRequest = undefined;
            cm.data = {} as any;
            res = cm.sendBikeUpdate({ refresh:true})
            expect(res).toEqual({targetPower:100})

            jest.advanceTimersByTime(1000);
            res = cm.updateData({time:0,slope:0,speed:3,isPedalling:true,power:100,distanceInternal:0,pedalRpm:11,heartrate:216,gear:10})

            res = cm.sendBikeUpdate({ refresh:true})
            res = expect(res).toEqual({});


            
        })

        test('slope change with race',()=>{
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
            res = cm.updateData({speed:50,slope:0,power:res.targetPower??0,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:242351,gear:10,time:1626})
            expect(res.speed).toBeGreaterThan(31)

            res = cm.sendBikeUpdate({slope:0})
            jest.advanceTimersByTime(1000);
            res = cm.updateData({speed:60,slope:0,power:158,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:242351,gear:10,time:1626})
            expect(res.speed).toBeCloseTo(31.3,1)

            res = cm.sendBikeUpdate({slope:1})
            jest.advanceTimersByTime(1000);
            res = cm.updateData({speed:870,slope:0,power:158,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:242351,gear:10,time:1626})
            expect(res.speed).toBeLessThan(31.3)
        })



        test('rpm change',()=>{
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
            cm.updateData({speed:30,slope:0,power:res.targetPower??0,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:242351,gear:10,time:1626} )  
            expect(cm.data.speed).toBeCloseTo(38.8,1)
            expect(cm.event.rpmUpdated).toBe(true)         
            res = cm.sendBikeUpdate({refresh:true})
            expect(res.targetPower).toBe(146)

            // decrease cadence -> target power will decrease & speed will decrease once bike has adjusted power
            jest.advanceTimersByTime(1000);
            cm.updateData({speed:30,slope:0,power:158,isPedalling:true, pedalRpm:89,heartrate:99,distanceInternal:242351,gear:10,time:1626} )  
            expect(cm.data.speed).toBeCloseTo(38.2,1)
            expect(cm.event.rpmUpdated).toBe(true)         
            res = cm.sendBikeUpdate({refresh:true})
            expect(res.targetPower).toBeLessThan(158)
            jest.advanceTimersByTime(1000);
            cm.updateData({speed:30,slope:0,power:res.targetPower??0,isPedalling:true, pedalRpm:89,heartrate:99,distanceInternal:242351,gear:10,time:1626} )  
            expect(cm.data.speed).toBeCloseTo(37.6,1)
            expect(cm.event.rpmUpdated).toBeUndefined()

            expect(res.targetPower).not.toBe(100)

            // decrease cadence to zero, speed will not be immediately set to zero, sets target to "startPower"
            jest.advanceTimersByTime(1000);
            cm.updateData({speed:30,slope:0,power:158,isPedalling:false, pedalRpm:0,heartrate:99,distanceInternal:242351,gear:10,time:1626} )  
            expect(cm.data.speed).not.toBe(0)
            res = cm.sendBikeUpdate({refresh:true})
            expect(res.targetPower).toBe( cm.getSetting('startPower') )
        })



        test('bug: NaN in display for speed',()=>{
            const cm = new ERGCyclingMode(adapter);
            cm.getSetting = jest.fn( (key) => { 
                if (key==='startPower') return 100
                if (key==='bikeType') return 'Mountain'
            });

            let res;
            cm.prevRequest = {maxPower:400};
            cm.event = {}
            cm.data = {speed:4.5,power:68,distanceInternal:1,pedalRpm:62.2,isPedalling:true,heartrate:0,slope:42.973320188763346,gear:13,time:66.10100000000001};
            cm.prevUpdateTS = Date.now()

            // increase cadence -> target power will increase & speed will increase once bike has adjusted power
            jest.advanceTimersByTime(971);
            res = cm.updateData({isPedalling:true,power:58,pedalRpm:63.2,speed:15.515999999999998,heartrate:0,distanceInternal:290,gear:13,time:72} )  
            expect(res.speed).toBeDefined()
            
        })

        test('bug no change after rpm change',()=>{
            const cm = new ERGCyclingMode(adapter);
            cm.getSetting = jest.fn( (key) => { 
                if (key==='startPower') return 50
                if (key==='bikeType') return 'race'
            });

            let res;
            cm.prevRequest = {targetPower:50,init:true};
            cm.event = {}
            cm.data = {speed:40,slope:0,power:50,isPedalling:true,pedalRpm:90,heartrate:99,distanceInternal:10,gear:10,time:1220.219};
            cm.prevUpdateTS = Date.now()

            // increase cadence -> target power will increase & speed will increase once bike has adjusted power
            jest.advanceTimersByTime(1000);
            cm.updateData({speed:30,slope:0,power:158,isPedalling:true,pedalRpm:91,heartrate:99,distanceInternal:242351,gear:10,time:1626} )  
            expect(cm.event.rpmUpdated).toBe(true)         
            res = cm.sendBikeUpdate({refresh:true})
            expect(res.targetPower).toBeCloseTo(150,0)
            
        })


        test('bug: power limits not kept during workout',()=>{
            const cm = new ERGCyclingMode(adapter);
            cm.getSetting = jest.fn( (key) => { 
                if (key==='startPower') return 50
                if (key==='bikeType') return 'race'
            });

            let res;
            cm.prevRequest = {minPower:181,maxPower:181,targetPower:181};
            cm.event = {starting:true,tsStart:1672901061171,rpmUpdated:true}
            cm.data = {gear:9,pedalRpm:23,slope:0,power:50,speed:3.928287395349927,isPedalling:true,heartrate:77,distanceInternal:1230};
            cm.prevUpdateTS = Date.now()

            jest.advanceTimersByTime(250);
            res = cm.sendBikeUpdate({refresh:true})

            // increase cadence -> target power will increase & speed will increase once bike has adjusted power
            jest.advanceTimersByTime(750);
            cm.updateData({gear:9,pedalRpm:28.5,slope:7.348413074372249,power:181,speed:7.573560915382975,isPedalling:true,heartrate:77,distanceInternal:1234} )  
            expect(cm.event.rpmUpdated).toBe(true)         

            res = cm.sendBikeUpdate({refresh:true})
            expect(res.targetPower).toBeUndefined()
            expect(cm.prevRequest).toMatchObject({minPower:181,maxPower:181,targetPower:181})
            
        })


    })

})