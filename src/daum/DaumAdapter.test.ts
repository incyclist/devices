import { EventLogger } from 'gd-eventlog';
import DaumAdapter from './DaumAdapter';
import CyclingMode from '../CyclingMode';

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();
describe( 'DaumCdapter', ()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
        jest.useFakeTimers();
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined)
        jest.useRealTimers();
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
            getSetting: () => undefined
        }
    
        beforeEach( ()=>{
            a = new DaumAdapter( {userSettings:{weight:80}, bikeSettings:{weight:10}},null);
            a.setCyclingMode( cm)
        })

        test('start - no pedalling',()=>{
            cm.updateData = jest.fn( (data)=>({gear:10, power:100, speed:30}));
            let data = {}

            a.updateData(data,{cadence:0, power:25, speed:0, heartrate:0, distance:0, time:0})
            expect(data).toMatchObject({isPedalling:false, power:25, pedalRpm:0, speed:0, heartrate:0, distance:0, distanceInternal:0, time:0})
        })
        test('start - pedalling',()=>{
            cm.updateData = jest.fn( (data)=>({gear:10, power:100, speed:30}));
            let data = {}

            a.updateData(data,{gear:9, cadence:90, power:125, speed:28, heartrate:59, distance:100, time:10})
            expect(data).toMatchObject({isPedalling:true, power:125, pedalRpm:90, speed:28, heartrate:59, distance:1, distanceInternal:100, time:10})
        })
        test('start - no cycling mode set: uses default cycling mode',()=>{
            a.cyclingMode = undefined;
            a.getDefaultCyclingMode = jest.fn( ()=>cm);
            let data = {}

            a.updateData(data,{gear:9, cadence:90, power:125, speed:28, heartrate:59, distance:100, time:10})
            expect(a.getDefaultCyclingMode).toHaveBeenCalled()
            
        })

    })

    describe('updateData component test',()=>{
        let a: DaumAdapter;
        let data:any;
    
        beforeEach( async ()=>{
            a = new DaumAdapter( {userSettings:{weight:80}, bikeSettings:{weight:10}},null);
            data={}
            await a.updateData(data,{cadence:90,slope:0,gear:10, power:100});
        })
        test('start - no pedalling',()=>{
            let data = {}
            
            const res = a.updateData(data,{cadence:0, power:50, speed:0, heartrate:0, distance:0, time:0, gear:10})
            expect(data).toEqual({isPedalling:false, power:0, pedalRpm:0, speed:0, heartrate:0, distance:0, distanceInternal:0, time:0,gear:10, slope:0})
            expect(res).toEqual(data)
        })

        test('start - pedalling',()=>{
            let data = {}
            const res = a.updateData(data,{cadence:90, power:50, speed:29.9, heartrate:0, distance:0, time:0, gear:10})
            expect(data).toEqual({isPedalling:true, power:50, pedalRpm:90, speed:20.5, heartrate:0, distance:0, distanceInternal:0, time:0,gear:10, slope:0})
        })

        test('increase slope: power does not change, speed gets slower',()=>{
            let data = {} as any;
            a.updateData(data,{cadence:90, power:50, slope:0, speed:29.9, heartrate:0, distance:0, time:0, gear:10})
            expect(data).toEqual({isPedalling:true, power:50, pedalRpm:90, speed:20.5, heartrate:0, distance:0, distanceInternal:0, time:0,gear:10, slope:0})
            a.updateData(data,{cadence:90, power:50, slope:1, speed:29.9, heartrate:0, distance:0, time:0, gear:10})
            expect(data.power).toEqual(50)
            expect(data.speed).toBeCloseTo(12.7,1)
            a.updateData(data,{cadence:90, power:50, slope:2, speed:29.9, heartrate:0, distance:0, time:0, gear:10})
            expect(data.power).toEqual(50)
            expect(data.speed).toBeCloseTo(8.3,1)
        })

        test('slope negative: power does not change, speed increases',()=>{
            let data = {} as any;
            a.updateData(data,{cadence:90, power:50, slope:0, speed:29.9, heartrate:0, distance:0, time:0, gear:10})
            expect(data).toEqual({isPedalling:true, power:50, pedalRpm:90, speed:20.5, heartrate:0, distance:0, distanceInternal:0, time:0,gear:10, slope:0})
            a.updateData(data,{cadence:90, power:50, slope:-1, speed:29.9, heartrate:0, distance:0, time:0, gear:10})
            expect(data.speed).toBeCloseTo(29.7,1)
            a.updateData(data,{cadence:90, power:50, slope:-2, speed:29.9, heartrate:0, distance:0, time:0, gear:10})
            expect(data.speed).toBeCloseTo(34.3,1)
        })


    })

  
    describe('sendBikeUpdate',()=>{
        let a: DaumAdapter;
        let data:any;
    
        beforeEach( async ()=>{
            a = new DaumAdapter( {userSettings:{weight:80}, bikeSettings:{weight:10}},null);
            a.sendRequest = jest.fn( (request)=>Promise.resolve(request))
            data={}
            await a.updateData(data,{cadence:90,slope:0,gear:10, power:100});
        })

        test('reset: will only reset internal values, no updates are sent to bike',async ()=>{
            const res = await a.sendBikeUpdate({reset:true}) as any;
            expect(res).toEqual({reset:true})
        })

        test('empty object: same as reset',async ()=>{
            const res = await a.sendBikeUpdate({})
            expect(res).toEqual({})
        })


        test('refresh, on first request: just calculates target Power',async ()=>{
            const res = await a.sendBikeUpdate({refresh:true}) as any;
            expect(res.targetPower).toBeCloseTo(125,0)
            expect(res.slope).toBeUndefined()
        })
        test('refresh,on subsequent request, copies previous request',async ()=>{
            await a.sendBikeUpdate({slope:10, targetPower:100});
            const res = await a.sendBikeUpdate({refresh:true}) as any;
            expect(res.targetPower).toBeCloseTo(100,0)
            expect(res.slope).toBeUndefined()
        })

        test('slope: sets target Power',async ()=>{
           
            await a.sendBikeUpdate({reset:true})
            const res = await a.sendBikeUpdate({slope:5}) as any;
            expect(res.slope).toBeUndefined()
            expect(res.targetPower).toBeCloseTo(125,0)      
        })

        test('slope: slope value has no impact',async ()=>{
            let res;
            
            res= await a.sendBikeUpdate({slope:1})
            expect(res.targetPower).toBeCloseTo(125,0)      
            res = await a.sendBikeUpdate({slope:2})
            expect(res.targetPower).toBeCloseTo(125,0)      
            res = await a.sendBikeUpdate({slope:12})
            expect(res.targetPower).toBeCloseTo(125,0)      

            await a.updateData(data,{cadence:90,slope:0,gear:20, power:100, speed:30});            
            res = await a.sendBikeUpdate({slope:12})
            expect(res.targetPower).toBeCloseTo(293,0)      

        })

        test('rpm changes will enforce recalculation',async ()=>{
            let res;
            res = await a.sendBikeUpdate({slope:1})
            expect(res.targetPower).toBeCloseTo(125,0)      

            await a.updateData(data,{cadence:91,gear:10});
            res = await a.sendBikeUpdate({slope:1})
            expect(res.targetPower).toBeCloseTo(129,0)      

            await a.updateData(data,{cadence:90,gear:10});
            res = await a.sendBikeUpdate({slope:1})
            expect(res.targetPower).toBeCloseTo(125,0)      

            res = await a.sendBikeUpdate({slope:12})
            expect(res.targetPower).toBeCloseTo(125,0)      

        })

        test('targetPower set',async ()=>{
            let res;
            res = await a.sendBikeUpdate({targetPower:200})
            expect(res.targetPower).toBeCloseTo(200,0)      
            res = await a.sendBikeUpdate({slope:22, targetPower:200})
            expect(res.targetPower).toBeCloseTo(200,0)      
            res = await a.sendBikeUpdate({minPower:22, targetPower:200})
            expect(res.targetPower).toBeCloseTo(200,0)      
        })
        test('minPower=maxPower',async ()=>{
            let res;
            res = await a.sendBikeUpdate({minPower:200,maxPower:200})
            expect(res.targetPower).toBeCloseTo(200,0)      
            res = await a.sendBikeUpdate({slope:22, minPower:200,maxPower:200})
            expect(res.targetPower).toBeCloseTo(200,0)      
            res = await a.sendBikeUpdate({minPower:22, maxPower:22})
            expect(res.targetPower).toBeCloseTo(22,0)      
        })

        
        test('maxPower set, but current power below limit: ',async ()=>{
            //await a.updateData(data,{cadence:90,slope:0,gear:10, power:100});                       
            let res = await a.sendBikeUpdate({maxPower:200}) as any
            expect(res.targetPower).toBeCloseTo(125,0)      
 
        })
        test('maxPower set, current power above limit: enforces limit',async ()=>{          
            await a.updateData(data,{cadence:90,gear:20});            
            const res =await a.sendBikeUpdate({  maxPower:200}) as any;
            expect(res.targetPower).toEqual(200)
 
        })
        test('maxPower and targetPower set: targetPower overrules',async ()=>{          
            const res =await a.sendBikeUpdate({maxPower:120, targetPower:200}) as any;
            expect(res.targetPower).toEqual(200)
 
        })

        test('maxPower after slope update: maxPower is reflected',async ()=>{         
            data.slope=1.5
            await a.updateData(data,{cadence:90,gear:10});   
            const res =await a.sendBikeUpdate({maxPower:120 }) as any;
            expect(res.targetPower).toBeCloseTo(120,0)
 
        })

        test('minPower set, but current power above limit: ',async ()=>{
            //await a.updateData(data,{cadence:90,slope:0,gear:10, power:100});                       
            let res = await a.sendBikeUpdate({minPower:90}) as any
            expect(res.targetPower).toBeCloseTo(125,0)      
 
        })
        test('min set, current power below limit: enforces limit',async ()=>{          
            await a.updateData(data,{cadence:10, gear:5});       // -> 2.5W     
            const res =await a.sendBikeUpdate({minPower:200}) as any;
            expect(res.targetPower).toEqual(200)
 
        })
        test('minPower and targetPower set: targetPower overrules',async ()=>{          
            const res =await a.sendBikeUpdate({maxPower:210, targetPower:200}) as any;
            expect(res.targetPower).toEqual(200)
 
        })

        test('minPower after slope update: minPower is reflected',async ()=>{         
            data.slope=1.5
            await a.updateData(data,{cadence:90,gear:10});   
            const res =await a.sendBikeUpdate({minPower:150 }) as any;
            expect(res.targetPower).toBeCloseTo(150,0)
 
        })


    }) 
})