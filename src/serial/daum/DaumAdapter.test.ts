import { EventLogger } from 'gd-eventlog';
import DaumAdapter from './DaumAdapter';
import CyclingMode, { CyclingModeBase, IncyclistBikeData } from '../../modes/cycling-mode';
import { MockLogger } from '../../../test/logger';
import { DeviceProperties } from '../../types/device';
import { SerialDeviceSettings } from '..';

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

const DEFAULT_SETTINGS = { interface:'serial', protocol: 'any'}

describe( 'DaumAdapter', ()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
        jest.useFakeTimers();
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( MockLogger)
        jest.useRealTimers();
    })

    describe('constructor' ,()=>{
        test('status',()=>{
            const a = new DaumAdapter(DEFAULT_SETTINGS)
            expect(a.bike).toBeUndefined()
            expect(a.stopped).toBe(false)
            expect(a.cyclingMode).toBeDefined();
            expect(a.cyclingData).toEqual({isPedalling:false,
                time:0,
                power:0,
                pedalRpm:0,
                speed:0,
                distanceInternal:0,
                heartrate:0})

        })
        test('with properties',()=>{
            const properties:DeviceProperties = { userWeight:80, bikeWeight:14 }
            const a = new DaumAdapter(DEFAULT_SETTINGS, properties)
            expect(a.cyclingMode).toBeDefined();
            expect(a.props).toMatchObject(properties)
                  
        })
        test('partial props',()=>{
            const properties:DeviceProperties = { bikeWeight:14 }
            const a = new DaumAdapter(DEFAULT_SETTINGS, properties)
            expect(a.props).toMatchObject(properties)
            expect(a.user).toEqual({})
        })
    })
   
    describe('setCyclingMode',()=>{
        let a: DaumAdapter<SerialDeviceSettings, DeviceProperties>  
        beforeEach( ()=>{
            a = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            
        })

        test('with mode object',()=>{
            const cm = new CyclingModeBase(a,{})
            a.setCyclingMode(cm)
            expect(a.cyclingMode).toBe(cm)
        })
        test('with mode object and settings',()=>{
            const cm = new CyclingModeBase(a,{})
            a.setCyclingMode(cm,{startPower:50})
            expect(a.cyclingMode.getSetting('startPower')).toBe(50)
            
        })

        test('with mode as string, mode is existing: assigns to a new object of that class',()=>{
            a.setCyclingMode('ERG')
            expect(a.cyclingMode.getName()).toBe('ERG')
        })
        test('with mode as string and settings, mode existing',()=>{
            a.setCyclingMode('ERG',{startPower: 400})
            expect(a.cyclingMode.getSetting('startPower')).toBe(400)
        })

        test('with mode as string, mode is not existing: uses default',()=>{
            a.cyclingMode =  new CyclingModeBase(a,{}) 
            a.cyclingMode.getName = jest.fn().mockReturnValue('mock')
            a.setCyclingMode('Something not existing')
            expect(a.cyclingMode.getName()).toBe('ERG')
        })
        test('with mode as string and settings, mode not existing',()=>{
            a.setCyclingMode('xyz',{startPower: 400})
            expect(a.cyclingMode.getSetting('startPower')).toBe(400)
        })

    })

    test('getDefaultCyclingMode',()=>{
        const a = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
        expect(a.getDefaultCyclingMode().getName()).toBe('ERG')
    })

    test('getCurrentBikeData: need to be implemnted in subclass',()=>{
        const a = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});

        expect( ()=>{a.getCurrentBikeData()}).toThrowError('Method not implemented.')
    })

    test('start: need to be implemnted in subclass',()=>{
        const a = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
        expect( ()=>{a.getCurrentBikeData()}).toThrowError('Method not implemented.')
    })


    describe('updateData unit test',()=>{
        let a: DaumAdapter<SerialDeviceSettings, DeviceProperties>  
        let cm: CyclingMode = {
            getName: () => '',
            getDescription: () => '',
            sendBikeUpdate: jest.fn(),
            updateData: jest.fn(),
            getProperties: jest.fn(),
            getProperty: jest.fn(),
            setSetting: jest.fn(),
            getBikeInitRequest: jest.fn(),
            setSettings: jest.fn(),
            getSetting: jest.fn(),
            getSettings: jest.fn(),
            setModeProperty: jest.fn(),
            getModeProperty: jest.fn(),
        }
    
        beforeEach( ()=>{
            a = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            a.setCyclingMode( cm)
        })

        test('returns values delivered by cm.updateData()',()=>{
            const cmData = {gear:10, power:100, speed:30, isPedalling:false,pedalRpm:0,heartrate:0,distance:0,distanceInternal:0  }
            cm.updateData = jest.fn( (data)=>cmData);

            a.updateData({pedalRpm:0, power:25, speed:0, heartrate:0, isPedalling:false,distanceInternal:0, time:0})
            expect(a.cyclingData).toEqual(cmData)
        })
        test('no cycling mode set: uses default cycling mode',()=>{
            (a as any).cyclingMode = undefined;
            a.getDefaultCyclingMode = jest.fn( ()=>cm);

            a.updateData({gear:9, pedalRpm:90, power:125, speed:28, heartrate:59,isPedalling:true, distanceInternal:100, time:0})
            expect(a.getDefaultCyclingMode).toHaveBeenCalled()
            
        })

    })

    describe('updateData component test',()=>{
        let a: DaumAdapter<SerialDeviceSettings, DeviceProperties>  
        let data:any;

        beforeAll( () => {
            jest.useFakeTimers();
        })
        afterAll( () => {
            jest.useRealTimers();
        })
    
        beforeEach( async ()=>{
            a = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            
            data={}
            await a.updateData({pedalRpm:0,power:0,speed:0,slope:0,gear:10,isPedalling:false});
        })

        test('start - no pedalling',()=>{
            let data = {}
            jest.advanceTimersByTime(1000);
            data = a.updateData({pedalRpm:0, power:50, speed:0, heartrate:0, time:0, gear:10, isPedalling:false})
            expect(data).toEqual({isPedalling:false, power:0, pedalRpm:0, speed:0, heartrate:0, distanceInternal:0, time:0,gear:10, slope:0})
            
        })

        test('start - pedalling',()=>{
            let data;

            jest.advanceTimersByTime(1000);            
            data=a.updateData({pedalRpm:90, power:50, speed:29.9, heartrate:0, isPedalling:true, time:0, gear:10})
            expect(data).toMatchObject({isPedalling:true, power:50, pedalRpm:90,  heartrate:0, time:1,gear:10, slope:0})
            expect(data.distanceInternal).toBeCloseTo(1,0)
            expect(data.speed).toBeCloseTo(3.8,1)
        })

        test('increase slope: power does not change, speed gets slower',()=>{
            let data;            

            jest.advanceTimersByTime(1000);            
            data = a.updateData({pedalRpm:90, power:50, slope:0, speed:29.9, heartrate:0, time:0, gear:10})
            expect(data).toMatchObject({isPedalling:true, power:50, pedalRpm:90, heartrate:0,   time:1,gear:10, slope:0})
            expect(data.distanceInternal).toBeCloseTo(1,0)
            expect(data.speed).toBeCloseTo(3.8,1)

            a.sendUpdate({slope:1})
            jest.advanceTimersByTime(1000);            
            data = a.updateData({pedalRpm:90, power:50, slope:1, speed:29.9, heartrate:0,  time:0, gear:10})
            expect(data.power).toEqual(50)
            expect(data.speed).toBeCloseTo(5.0,1)
            
            a.sendUpdate({slope:2})
            jest.advanceTimersByTime(1000);            
            data = a.updateData({pedalRpm:90, power:50, slope:2, speed:29.9, heartrate:0,  time:0, gear:10})
            expect(data.power).toEqual(50)
            expect(data.speed).toBeCloseTo(5.6,1)
        })

        test('slope negative: power does not change, speed increases',()=>{
            let data;
            jest.advanceTimersByTime(1000);            
            data = a.updateData({pedalRpm:90, power:50, slope:0, speed:29.9, heartrate:0,  time:0, gear:10})
            expect(data).toMatchObject({isPedalling:true, power:50, pedalRpm:90, heartrate:0, time:1,gear:10, slope:0})
            expect(data.distanceInternal).toBeCloseTo(1,0)
            expect(data.speed).toBeCloseTo(3.8,1)
            
            a.sendUpdate({slope:-1})
            jest.advanceTimersByTime(1000);            
            data = a.updateData({pedalRpm:90, power:50, slope:0, speed:29.9, heartrate:0,  time:0, gear:10})
            expect(data.speed).toBeCloseTo(5.5,1)
            expect(data.power).toEqual(50)

            a.sendUpdate({slope:-2})
            jest.advanceTimersByTime(1000);            
            data = a.updateData({pedalRpm:90, power:50, slope:-1, speed:29.9, heartrate:0,  time:0, gear:10})
            expect(data.speed).toBeCloseTo(7.1,1)
            expect(data.power).toEqual(50)

        })




    })

  
    describe('sendUpdate',()=>{
        let a: DaumAdapter<SerialDeviceSettings, DeviceProperties>  
        let data:IncyclistBikeData;
    
        beforeEach( async ()=>{
            a = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            a.sendRequest = jest.fn( (request)=>Promise.resolve(request))
            data={pedalRpm:90,slope:0,gear:10, power:100,speed:30}
            await a.updateData(data);
        })

        test('reset: will only reset internal values, no updates are sent to bike',async ()=>{
            const res = await a.sendUpdate({reset:true}) as any;
            expect(res).toEqual({reset:true})
        })

        test('empty object: same as reset',async ()=>{
            const res = await a.sendUpdate({})
            expect(res).toEqual({})
        })

        test('no data yet:',async ()=>{
            const b = new DaumAdapter( DEFAULT_SETTINGS,  {userWeight:80, bikeWeight:10});
            const res = await b.sendUpdate({})
            
            expect(res).toEqual({})
        })


        test('refresh, on first request: just calculates target Power',async ()=>{
            const res = await a.sendUpdate({refresh:true}) as any;
            expect(res.targetPower).toBeCloseTo(147,0)
            expect(res.slope).toBeUndefined()
        })
        test('refresh,on subsequent request, ERG will not repeat same request',async ()=>{
            await a.sendUpdate({slope:10, targetPower:100});
            const res = await a.sendUpdate({refresh:true}) as any;
            expect(res).toEqual({})
            
        })

        test('slope: sets target Power',async ()=>{
           
            await a.sendUpdate({reset:true})
            const res = await a.sendUpdate({slope:5}) as any;
            expect(res.slope).toBeUndefined()
            expect(res.targetPower).toBeCloseTo(147,0)      
        })

        test('slope: slope value has no impact',async ()=>{
            let res;
            
            res= await a.sendUpdate({slope:1})
            expect(res.targetPower).toBeCloseTo(147,0)      
            res = await a.sendUpdate({slope:2})
            expect(res.targetPower).toBeCloseTo(147,0)      
            res = await a.sendUpdate({slope:12})
            expect(res.targetPower).toBeCloseTo(147,0)      

            await a.updateData({pedalRpm:90,slope:0,gear:20, power:100, speed:30});            
            res = await a.sendUpdate({slope:12})
            expect(res.targetPower).toBeCloseTo(350,0)      

        })

        test('rpm changes will enforce recalculation',async ()=>{
            let res;
            res = await a.sendUpdate({slope:1})
            expect(res.targetPower).toBeCloseTo(147,0)      

            
            await a.updateData(Object.assign({},a.cyclingData,{pedalRpm:91,gear:10}));
            res = await a.sendUpdate({slope:1})
            expect(res.targetPower).toBeCloseTo(152,0)      

            await a.updateData(Object.assign({},a.cyclingData,{pedalRpm:90,gear:10}));
            res = await a.sendUpdate({slope:1})
            expect(res.targetPower).toBeCloseTo(147,0)      

            res = await a.sendUpdate({slope:12})
            expect(res.targetPower).toBeCloseTo(147,0)      

        })

        test('targetPower set',async ()=>{
            let res;
            res = await a.sendUpdate({targetPower:200})
            expect(res.targetPower).toBeCloseTo(200,0)      
            res = await a.sendUpdate({slope:22, targetPower:200})
            expect(res.targetPower).toBeCloseTo(200,0)      
            res = await a.sendUpdate({minPower:22, targetPower:200})
            expect(res.targetPower).toBeCloseTo(200,0)      
        })
        test('minPower=maxPower',async ()=>{
            let res;
            res = await a.sendUpdate({minPower:200,maxPower:200})
            expect(res.targetPower).toBeCloseTo(200,0)      
            res = await a.sendUpdate({slope:22, minPower:200,maxPower:200})
            expect(res.targetPower).toBeCloseTo(200,0)      
            res = await a.sendUpdate({minPower:22, maxPower:22})
            expect(res.targetPower).toBeCloseTo(22,0)      
        })

        
        test('maxPower set, but current power below limit: ',async ()=>{
            //await a.updateData(data,{cadence:90,slope:0,gear:10, power:100});                       
            let res = await a.sendUpdate({maxPower:200}) as any
            expect(res.targetPower).toBeCloseTo(147,0)      
 
        })
        test('maxPower set, current power above limit: enforces limit',async ()=>{          
            await a.updateData(Object.assign({},a.cyclingData,{pedalRpm:90,gear:20}));            
            const res =await a.sendUpdate({  maxPower:200}) as any;
            expect(res.targetPower).toEqual(200)
 
        })
        test('maxPower and targetPower set, targetPower>maxPower : maxPower overrules',async ()=>{          
            const res =await a.sendUpdate({maxPower:120, targetPower:200}) as any;
            expect(res.targetPower).toEqual(120)
 
        })
        test('maxPower and targetPower set, targetPower<maxPower : targetPower overrules',async ()=>{          
            const res =await a.sendUpdate({maxPower:220, targetPower:200}) as any;
            expect(res.targetPower).toEqual(200)
 
        })

        test('maxPower after slope update: maxPower is reflected',async ()=>{         
            data.slope=1.5
            await a.updateData(Object.assign({},a.cyclingData,{pedalRpm:90,gear:10}));   
            const res =await a.sendUpdate({maxPower:120 }) as any;
            expect(res.targetPower).toBeCloseTo(120,0)
 
        })

        test('minPower set, but current power above limit: ',async ()=>{
            //await a.updateData(data,{cadence:90,slope:0,gear:10, power:100});                       
            let res = await a.sendUpdate({minPower:90}) as any
            expect(res.targetPower).toBeCloseTo(147,0)      
 
        })
        test('min set, current power below limit: enforces limit',async ()=>{          
            await a.updateData(Object.assign({},a.cyclingData,{peadlRpm:10, gear:5}));       // -> 2.5W     
            const res =await a.sendUpdate({minPower:200}) as any;
            expect(res.targetPower).toEqual(200)
 
        })
        test('minPower and targetPower set: targetPower overrules',async ()=>{          
            const res =await a.sendUpdate({maxPower:210, targetPower:200}) as any;
            expect(res.targetPower).toEqual(200)
 
        })

        test('minPower after slope update: minPower is reflected',async ()=>{         
            data.slope=-1.5
            await a.updateData(Object.assign({},a.cyclingData,{pedalRpm:90,gear:10}));   
            const res =await a.sendUpdate({minPower:180 }) as any;
            expect(res.targetPower).toBeCloseTo(180,0)
 
        })


    }) 
})