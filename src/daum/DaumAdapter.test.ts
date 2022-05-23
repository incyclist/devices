import { EventLogger } from 'gd-eventlog';
import DaumAdapter from './DaumAdapter';
import CyclingMode, { CyclingModeBase } from '../CyclingMode';

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();
    
describe( 'DaumAdapter', ()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
        jest.useFakeTimers();
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined)
        jest.useRealTimers();
    })

    describe('constructor' ,()=>{
        test('status',()=>{
            const bike = {name:'test'}
            const a = new DaumAdapter({},bike)
            expect(a.bike).toBe(bike)
            expect(a.stopped).toBe(false)
            expect(a.paused).toBe(false)

        })
        test('status',()=>{
            const bike = {name:'test'}
            const a = new DaumAdapter({},bike)
            expect(a.stopped).toBe(false)
            expect(a.paused).toBe(false)
            expect(a.cyclingData).toEqual({isPedalling:false,
                time:0,
                power:0,
                pedalRpm:0,
                speed:0,
                distanceInternal:0,
                heartrate:0})

        })
        test('with userSettings',()=>{
            const userSettings = { a:1, b:2 }
            const bike = {name:'test'}
            const a = new DaumAdapter({userSettings},bike)
            expect(a.cyclingMode).toBeUndefined();
            expect(a.userSettings).toEqual(userSettings)
            expect(a.bikeSettings).toEqual({})            
        })
        test('no props',()=>{
            const bike = {name:'test'}
            const a = new DaumAdapter(undefined,bike)
            expect(a.cyclingMode).toBeUndefined();
            expect(a.userSettings).toEqual({})
            expect(a.bikeSettings).toEqual({})            
        })
    })
   
    describe('setCyclingMode',()=>{
        let a: DaumAdapter;

    
        beforeEach( ()=>{
            a = new DaumAdapter( {userSettings:{weight:80}, bikeSettings:{weight:10}},null);
            
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
            a.setCyclingMode('Something not existing')
            expect(a.cyclingMode.getName()).toBe('ERG')
        })
        test('with mode as string and settings, mode not existing',()=>{
            a.setCyclingMode('xyz',{startPower: 400})
            expect(a.cyclingMode.getSetting('startPower')).toBe(400)
        })

    })

    test('getDefaultCyclingMode',()=>{
        const a = new DaumAdapter( {userSettings:{weight:80}, bikeSettings:{weight:10}},null);
        expect(a.getDefaultCyclingMode().getName()).toBe('ERG')
    })

    test('getCurrentBikeData: need to be implemnted in subclass',()=>{
        const a = new DaumAdapter({},{name:'test'})
        expect( ()=>{a.getCurrentBikeData()}).toThrowError('Method not implemented.')
    })

    test('start: need to be implemnted in subclass',()=>{
        const a = new DaumAdapter({},{name:'test'})
        expect( ()=>{a.getCurrentBikeData()}).toThrowError('Method not implemented.')
    })

    test('isBike',()=> {
        const a = new DaumAdapter({},{name:'test'})
        expect(a.isBike()).toBe(true)
    })
    test('isHrm',()=> {
        const a = new DaumAdapter({},{name:'test'})
        expect(a.isHrm()).toBe(true)
    })
    test('isPower',()=> {
        const a = new DaumAdapter({},{name:'test'})
        expect(a.isPower()).toBe(true)
    })

    test('setIgnoreHrm',()=> {
        const a = new DaumAdapter({},{name:'test'})
        a.setIgnoreHrm(true)
        expect(a.ignoreHrm).toBe(true)        
    })
    test('setIgnoreBike',()=> {
        const a = new DaumAdapter({},{name:'test'})
        a.setIgnoreBike(true)
        expect(a.ignoreBike).toBe(true)        
    })

    describe('updateData unit test',()=>{
        let a: DaumAdapter;
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
            a = new DaumAdapter( {userSettings:{weight:80}, bikeSettings:{weight:10}},null);
            a.setCyclingMode( cm)
        })

        test('returns values delivered by cm.updateData()',()=>{
            const cmData = {gear:10, power:100, speed:30, isPedalling:false,pedalRpm:0,heartrate:0,distance:0,distanceInternal:0  }
            cm.updateData = jest.fn( (data)=>cmData);
            let data = {}

            a.updateData(data,{cadence:0, power:25, speed:0, heartrate:0, distance:0, time:0})
            expect(a.cyclingData).toEqual(cmData)
        })
        test('no cycling mode set: uses default cycling mode',()=>{
            a.cyclingMode = undefined;
            a.getDefaultCyclingMode = jest.fn( ()=>cm);
            let data = {}

            a.updateData(data,{gear:9, cadence:90, power:125, speed:28, heartrate:59, distance:100, time:0})
            expect(a.getDefaultCyclingMode).toHaveBeenCalled()
            
        })

    })

    describe('updateData component test',()=>{
        let a: DaumAdapter;
        let data:any;

        beforeAll( () => {
            jest.useFakeTimers();
        })
        afterAll( () => {
            jest.useRealTimers();
        })
    
        beforeEach( async ()=>{
            a = new DaumAdapter( {userSettings:{weight:80}, bikeSettings:{weight:10}},null);
            data={}
            await a.updateData(data,{cadence:0,power:0,speed:0,slope:0,gear:10});
        })

        test('start - no pedalling',()=>{
            let data = {}
            jest.advanceTimersByTime(1000);
            data = a.updateData(data,{cadence:0, power:50, speed:0, heartrate:0, distance:0, time:0, gear:10})
            expect(data).toEqual({isPedalling:false, power:0, pedalRpm:0, speed:0, heartrate:0, distanceInternal:0, time:0,gear:10, slope:0})
            
        })

        test('start - pedalling',()=>{
            let data;

            jest.advanceTimersByTime(1000);            
            data=a.updateData({},{cadence:90, power:50, speed:29.9, heartrate:0, distance:0, time:0, gear:10})
            expect(data).toEqual({isPedalling:true, power:50, pedalRpm:90, speed:3.8, heartrate:0, distanceInternal:1, time:1,gear:10, slope:0})
        })

        test('increase slope: power does not change, speed gets slower',()=>{
            let data;            

            jest.advanceTimersByTime(1000);            
            data = a.updateData({},{cadence:90, power:50, slope:0, speed:29.9, heartrate:0, time:0, gear:10})
            expect(data).toEqual({isPedalling:true, power:50, pedalRpm:90, speed:3.8, heartrate:0, distanceInternal:1, time:1,gear:10, slope:0})

            a.sendUpdate({slope:1})
            jest.advanceTimersByTime(1000);            
            data = a.updateData(a.cyclingData,{cadence:90, power:50, slope:1, speed:29.9, heartrate:0,  time:0, gear:10})
            expect(data.power).toEqual(50)
            expect(data.speed).toBeCloseTo(5.0,1)
            
            a.sendUpdate({slope:2})
            jest.advanceTimersByTime(1000);            
            data = a.updateData(a.cyclingData,{cadence:90, power:50, slope:2, speed:29.9, heartrate:0,  time:0, gear:10})
            expect(data.power).toEqual(50)
            expect(data.speed).toBeCloseTo(5.6,1)
        })

        test('slope negative: power does not change, speed increases',()=>{
            let data;
            jest.advanceTimersByTime(1000);            
            data = a.updateData({},{cadence:90, power:50, slope:0, speed:29.9, heartrate:0,  time:0, gear:10})
            expect(data).toEqual({isPedalling:true, power:50, pedalRpm:90, speed:3.8, heartrate:0, distanceInternal:1, time:1,gear:10, slope:0})
            
            a.sendUpdate({slope:-1})
            jest.advanceTimersByTime(1000);            
            data = a.updateData(data,{cadence:90, power:50, slope:0, speed:29.9, heartrate:0,  time:0, gear:10})
            expect(data.speed).toBeCloseTo(5.5,1)
            expect(data.power).toEqual(50)

            a.sendUpdate({slope:-2})
            jest.advanceTimersByTime(1000);            
            data = a.updateData(data,{cadence:90, power:50, slope:-1, speed:29.9, heartrate:0,  time:0, gear:10})
            expect(data.speed).toBeCloseTo(7.1,1)
            expect(data.power).toEqual(50)

        })




    })

  
    describe('sendUpdate',()=>{
        let a: DaumAdapter;
        let data:any;
    
        beforeEach( async ()=>{
            a = new DaumAdapter( {userSettings:{weight:80}, bikeSettings:{weight:10}},null);
            a.sendRequest = jest.fn( (request)=>Promise.resolve(request))
            data={}
            await a.updateData(data,{cadence:90,slope:0,gear:10, power:100});
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
            const b = new DaumAdapter( {userSettings:{weight:80}, bikeSettings:{weight:10}},null);
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

            await a.updateData(data,{cadence:90,slope:0,gear:20, power:100, speed:30});            
            res = await a.sendUpdate({slope:12})
            expect(res.targetPower).toBeCloseTo(350,0)      

        })

        test('rpm changes will enforce recalculation',async ()=>{
            let res;
            res = await a.sendUpdate({slope:1})
            expect(res.targetPower).toBeCloseTo(147,0)      

            await a.updateData(data,{cadence:91,gear:10});
            res = await a.sendUpdate({slope:1})
            expect(res.targetPower).toBeCloseTo(152,0)      

            await a.updateData(data,{cadence:90,gear:10});
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
            await a.updateData(data,{cadence:90,gear:20});            
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
            await a.updateData(data,{cadence:90,gear:10});   
            const res =await a.sendUpdate({maxPower:120 }) as any;
            expect(res.targetPower).toBeCloseTo(120,0)
 
        })

        test('minPower set, but current power above limit: ',async ()=>{
            //await a.updateData(data,{cadence:90,slope:0,gear:10, power:100});                       
            let res = await a.sendUpdate({minPower:90}) as any
            expect(res.targetPower).toBeCloseTo(147,0)      
 
        })
        test('min set, current power below limit: enforces limit',async ()=>{          
            await a.updateData(data,{cadence:10, gear:5});       // -> 2.5W     
            const res =await a.sendUpdate({minPower:200}) as any;
            expect(res.targetPower).toEqual(200)
 
        })
        test('minPower and targetPower set: targetPower overrules',async ()=>{          
            const res =await a.sendUpdate({maxPower:210, targetPower:200}) as any;
            expect(res.targetPower).toEqual(200)
 
        })

        test('minPower after slope update: minPower is reflected',async ()=>{         
            data.slope=-1.5
            await a.updateData(data,{cadence:90,gear:10});   
            const res =await a.sendUpdate({minPower:180 }) as any;
            expect(res.targetPower).toBeCloseTo(180,0)
 
        })


    }) 
})