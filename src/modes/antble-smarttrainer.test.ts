import SmartTrainerCyclingMode from "./antble-smarttrainer"
import MockAdapter from '../../test/mock-adapter';

let adapter = new MockAdapter()

describe('BLE-SmartTrainer',()=>{

    beforeAll( () => {
        jest.useFakeTimers();
    })
    afterAll( () => {
        jest.useRealTimers();
    })

    test('statics',()=>{
        const m = new SmartTrainerCyclingMode(adapter)

        expect(m.getName()).toBe('Smart Trainer')
        expect(m.getDescription()).toMatchSnapshot()
        expect(m.getProperties()).toMatchSnapshot()
        expect(SmartTrainerCyclingMode.supportsERGMode()).toBe(false)
    })

    describe ( 'getBikeInitRequest()',()=>{

        test('default',()=>{
            const cyclingMode = new SmartTrainerCyclingMode(adapter); 
            const request = cyclingMode.getBikeInitRequest();
            expect( request ).toEqual( { slope: 0})
        })
    })

    describe('sendUpdate',()=>{

        let cm:SmartTrainerCyclingMode;
        let bikeType = 'Race'

        beforeEach( ()=>{
            cm = new SmartTrainerCyclingMode(adapter);
            cm.getSetting = jest.fn( (key) => { 
                if (key==='bikeType') return bikeType
                return cm.settings[key]
            });

        })

        test('starting',()=>{

            let res;
            
            res = cm.sendBikeUpdate({ slope:1})
            expect(res).toEqual({slope:1})
            expect(cm.getSlope()).toBe(1)

            jest.advanceTimersByTime(1000);
            cm.updateData({time:0,slope:0,speed:3,isPedalling:true,power:100,distanceInternal:0,pedalRpm:11,heartrate:216,gear:10})
            res = cm.sendBikeUpdate({ refresh:true})
            expect(res).toEqual({slope:1});
        })
  

        test('resetting',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ slope:1})
            expect(res).toEqual({slope:1})
            expect(cm.prevRequest).toEqual({slope:1})

            res = cm.sendBikeUpdate({ reset:true})
            expect(res).toEqual({reset:true});
            expect(cm.prevRequest).toEqual({})

        })

        test('empty request repeats last request',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ slope:2})
            expect(res).toEqual({slope:2})

            res = cm.sendBikeUpdate({})
            expect(res).toEqual({slope:2,refresh:true})
        })

        test('empty request at start',()=>{
            let res;
            
            res = cm.sendBikeUpdate({})
            expect(res).toEqual({})

        })

        test('setting targetPower, triggers prev target to be sent again',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ slope:1})
            expect(res).toEqual({slope:1})

            res = cm.sendBikeUpdate({targetPower:120})
            expect(res).toEqual({slope:1,refresh:true})
        })



        test('setting minPower will resend prev target',()=>{
            let res;

            res = cm.sendBikeUpdate({ slope:1})
            expect(res).toEqual({slope:1})
            
            res = cm.sendBikeUpdate({minPower:25})
            expect(res).toEqual({slope:1,refresh:true})
            
        })

        test('setting maxPower will resend prev target',()=>{
            let res;

            res = cm.sendBikeUpdate({ slope:1})
            expect(res).toEqual({slope:1})
            
            res = cm.sendBikeUpdate({maxPower:125})
            expect(res).toEqual({slope:1,refresh:true})
            
        })


        test('setting minPower=maxPower will resend prev target',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ slope:1})
            expect(res).toEqual({slope:1})
            
            res = cm.sendBikeUpdate({minPower:125,maxPower:125})
            expect(res).toEqual({slope:1,refresh:true})
            
        })

        test('setting temporary updates  will resend prev target',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ slope:1})
            expect(res).toEqual({slope:1})

            res = cm.sendBikeUpdate({targetPowerDelta:10})
            expect(res).toEqual({slope:1,refresh:true})

        })

        test('slope adjustment has been set',()=>{
            let res;

            cm.setSetting('slopeAdj',50)
            cm.setSetting('slopeAdjDown',10)
            
            res = cm.sendBikeUpdate({ slope:10})
            expect(res).toEqual({slope:5})
            expect(cm.data.slope).toBe(10)

            res = cm.sendBikeUpdate({ slope:-10})
            expect(res).toEqual({slope:-1})
            expect(cm.data.slope).toBe(-10)

        })


    })


    describe('updateData',()=>{

        let cm:any;
        let bikeType = 'race'

        beforeEach( ()=>{
            cm = new SmartTrainerCyclingMode(adapter);
            cm.getSetting = jest.fn( (key) => { 
                if (key==='bikeType') return bikeType
            });
            cm.getTimeSinceLastUpdate = jest.fn().mockReturnValue(1) // 1s

        })

        test('initial call not cycling',()=>{
            const res = cm.updateData({power:0,pedalRpm:0,speed:0})
            expect(res).toMatchObject({power:0,pedalRpm:0,speed:0,time:0})
        })
        test('initial call cycling with low rpm',()=>{
            const res = cm.updateData({power:10,pedalRpm:8,speed:8})
            expect(res).toMatchObject({power:10,pedalRpm:8,speed:expect.closeTo(1.7,1),time:1,distanceInternal:expect.closeTo(0.5,1)})
        })

        test('stopped cycling, current speed below MIN and prev speed<1',()=>{
            cm.getData = jest.fn().mockReturnValue({speed:1, power:0, time:1})

            const res = cm.updateData({power:0,pedalRpm:0,speed:8})
            expect(res).toMatchObject({power:0,pedalRpm:0,speed:0,time:1})
        })
        test('stopped cycling, current speed below MIN and prev speed>1',()=>{
            cm.getData = jest.fn().mockReturnValue({speed:9, power:0, time:1})

            const res = cm.updateData({power:0,pedalRpm:0,speed:8})
            expect(res).toMatchObject({power:0,pedalRpm:0,speed:8,time:2})
        })

        test('stopped cycling, current speed above MIN ',()=>{
            cm.getData = jest.fn().mockReturnValue({speed:30, power:0, time:1})

            const res = cm.updateData({power:0,pedalRpm:0,speed:30})
            expect(res).toMatchObject({power:0,pedalRpm:0,speed:expect.closeTo(29.2,1),time:2})
        })

        test('bikeType race',()=>{
            cm.getData = jest.fn().mockReturnValue({speed:30, power:100, time:1,slope:1})
            bikeType = 'race'
            const res = cm.updateData({power:100,pedalRpm:90})
            expect(res).toMatchObject({speed:expect.closeTo(29.4,1),time:2})
        })
        test('bikeType mountain',()=>{
            cm.getData = jest.fn().mockReturnValue({speed:30, power:100, time:1,slope:1})
            bikeType = 'mountain'
            const res = cm.updateData({power:100,pedalRpm:90})
            expect(res).toMatchObject({speed:expect.closeTo(29.0,1),time:2})
        })

        test('bikeType triathlon',()=>{
            cm.getData = jest.fn().mockReturnValue({speed:30, power:100, time:1,slope:1})
            bikeType = 'triathlon'
            const res = cm.updateData({power:100,pedalRpm:90})
            expect(res).toMatchObject({speed:expect.closeTo(29.5,1),time:2})
        })

    })

    describe('checkSlopeWithSimulatedShifting',()=>{
        let cm:SmartTrainerCyclingMode;
        let bikeType = 'Race'

        const setData = (c:any, data:any) => {
            c.data = { ...c.data, ...data }
        }

        const setupMocks = (c:any) => { 
            c.getTimeSinceLastUpdate = jest.fn().mockReturnValue(1) // 1s
            c.getSetting = jest.fn( (key) => { 
                if (key==='bikeType') return bikeType
                if (key==='slopeAdj') return 100
                if (key==='slopeAdjDown') return 50
                if (key==='startGear') return 12
                if (key==='virtshift') return 'Incyclist'
                return cm.settings[key]
            });
        }
            

        beforeEach( ()=>{
            cm = new SmartTrainerCyclingMode(adapter);

            setupMocks(cm)
        })

        test('start pedalling',()=>{
            
            let newRequest 

            cm.updateData({slope:0,speed:10,isPedalling:false,power:0,distanceInternal:0,pedalRpm:0})
            newRequest = cm.sendBikeUpdate({slope:0})
            console.log('newRequest', newRequest)

            cm.updateData({slope:0,speed:1.44,isPedalling:true,power:6,distanceInternal:0.46,pedalRpm:0})
            newRequest = cm.sendBikeUpdate({slope:0})
            console.log('newRequest', newRequest)

            cm.updateData({slope:0,speed:3.21,isPedalling:true,power:27,distanceInternal:1.39,pedalRpm:0})
            newRequest = cm.sendBikeUpdate({slope:0})
            console.log('newRequest', newRequest)

            cm.updateData({slope:0,speed:5.68,isPedalling:true,power:54,distanceInternal:3.34,pedalRpm:34})
            newRequest = cm.sendBikeUpdate({slope:0})
            console.log('newRequest', newRequest)

            cm.updateData({slope:0,speed:5.68,isPedalling:true,power:48,distanceInternal:5.54,pedalRpm:35})
            newRequest = cm.sendBikeUpdate({slope:0})
            console.log('newRequest', newRequest)
        })
      

    })

        


})