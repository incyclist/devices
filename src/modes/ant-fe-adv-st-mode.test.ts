import AdvSmartTrainerCyclingMode from "./ant-fe-adv-st-mode"
import MockAdapter from '../../test/mock-adapter';
import SmartTrainerCyclingMode from "./antble-smarttrainer";

let adapter = new MockAdapter()

describe('Adv SmartTrainer',()=>{

    beforeAll( () => {
        jest.useFakeTimers();
    })
    afterAll( () => {
        jest.useRealTimers();
    })

    test('statics',()=>{

        const stMode = new SmartTrainerCyclingMode(adapter);
        expect(stMode.getName()).toBe('Smart Trainer')
        expect(stMode.getConfig().name).toBe('Smart Trainer')

        const m = new AdvSmartTrainerCyclingMode(adapter)


        expect(m.getName()).toBe('Advanced Smart Trainer')
        expect(m.getDescription()).toMatchSnapshot()
        expect(m.getProperties()).toMatchSnapshot()
        expect(AdvSmartTrainerCyclingMode.supportsERGMode()).toBe(false)
        expect(m.isSIM()).toBe(true)
        expect(m.isERG()).toBeFalsy()
        expect(m.getConfig().name).toBe('Advanced Smart Trainer')

        expect(stMode.getName()).toBe('Smart Trainer')
        expect(stMode.getConfig().name).toBe('Smart Trainer')

    })

    describe ( 'getBikeInitRequest()',()=>{

        test('default',()=>{
            const cyclingMode = new AdvSmartTrainerCyclingMode(adapter); 

            const request = cyclingMode.getBikeInitRequest();
            expect( request ).toEqual( { slope: 0})
        })
    })

    describe('sendUpdate',()=>{

        let cm;
        let bikeType = 'Race'

        beforeEach( ()=>{
            cm = new AdvSmartTrainerCyclingMode(adapter);
            cm.getSetting = jest.fn( (key) => { 
                if (key==='bikeType') return bikeType
            });

        })

        test('starting',()=>{

            let res;
            
            res = cm.buildUpdate({ slope:1})
            expect(res).toEqual({slope:1})
            expect(cm.getSlope()).toBe(1)

            jest.advanceTimersByTime(1000);
            cm.updateData({time:0,slope:0,speed:3,isPedalling:true,power:100,distanceInternal:0,pedalRpm:11,heartrate:216,gear:10})
            res = cm.buildUpdate({ refresh:true})
            expect(res).toEqual({slope:1});
        })
  

        test('resetting',()=>{
            let res;
            
            res = cm.buildUpdate({ slope:1})
            expect(res).toEqual({slope:1})
            expect(cm.prevRequest).toEqual({slope:1})

            res = cm.buildUpdate({ reset:true})
            expect(res).toEqual({reset:true});
            expect(cm.prevRequest).toEqual({})

        })

        test('empty request repeats last request',()=>{
            let res;
            
            res = cm.buildUpdate({ slope:2})
            expect(res).toEqual({slope:2})

            res = cm.buildUpdate({})
            expect(res).toEqual({slope:2,refresh:true})
        })

        test('empty request at start',()=>{
            let res;
            
            res = cm.buildUpdate({})
            expect(res).toEqual({})

        })

        test('setting targetPower, triggers prev target to be sent again',()=>{
            let res;
            
            res = cm.buildUpdate({ slope:1})
            expect(res).toEqual({slope:1})

            res = cm.buildUpdate({targetPower:120})
            expect(res).toEqual({slope:1,refresh:true})
        })



        test('setting minPower will resend prev target',()=>{
            let res;

            res = cm.buildUpdate({ slope:1})
            expect(res).toEqual({slope:1})
            
            res = cm.buildUpdate({minPower:25})
            expect(res).toEqual({slope:1,refresh:true})
            
        })

        test('power below minPower, setting minPower will setTargetPower to limit',()=>{
            let res;
            cm.getData = jest.fn().mockReturnValue({power:50,pedalRpm:90, speed:30})

            res = cm.buildUpdate({ slope:1})
            expect(res).toEqual({slope:1})
            
            res = cm.buildUpdate({minPower:125})
            expect(res).toEqual({targetPower:125})

            res = cm.buildUpdate({slope:1,minPower:115})
            expect(res).toEqual({slope:1,targetPower:115})
            
        })

        test('setting maxPower will resend prev target',()=>{
            let res;

            res = cm.buildUpdate({ slope:1})
            expect(res).toEqual({slope:1})
            
            res = cm.buildUpdate({maxPower:125})
            expect(res).toEqual({slope:1,refresh:true})
            
        })

        test('power above maxPower, setting maxPower will setTargetPower to limit',()=>{
            let res;
            cm.getData = jest.fn().mockReturnValue({power:150,pedalRpm:90, speed:30})

            res = cm.buildUpdate({ slope:1})
            expect(res).toEqual({slope:1})
            
            res = cm.buildUpdate({maxPower:125})
            expect(res).toEqual({targetPower:125})

            res = cm.buildUpdate({slope:1,maxPower:125})
            expect(res).toEqual({slope:1,targetPower:125})
            
        })


        test('no data:setting minPower=maxPower will resend prev target',()=>{
            let res;
            
            res = cm.buildUpdate({ slope:1})
            expect(res).toEqual({slope:1})
            
            res = cm.buildUpdate({minPower:125,maxPower:125})
            expect(res).toEqual({slope:1,refresh:true})
            
        })

        test('with power:setting minPower=maxPower will resend prev target',()=>{

            let res;
            cm.getData = jest.fn().mockReturnValue({power:100,pedalRpm:90, speed:30})
            res = cm.buildUpdate({ slope:1})
            expect(res).toEqual({slope:1})
            
            res = cm.buildUpdate({slope:2,minPower:125,maxPower:125})
            expect(res).toEqual({slope:2,targetPower:125})

            res = cm.buildUpdate({minPower:135,maxPower:135})
            expect(res).toEqual({targetPower:135})
            
        })

        test('setting temporary updates  will resend prev target',()=>{
            let res;
            cm.getData = jest.fn().mockReturnValue({power:100,pedalRpm:90, speed:30})
            
            res = cm.buildUpdate({ slope:1,minPower:125,maxPower:125})
            expect(res).toEqual({slope:1,targetPower:125})

            res = cm.buildUpdate({targetPowerDelta:10})
            expect(res).toEqual({targetPower:135})

        })


    })


    describe('updateData',()=>{

        let cm;
        let bikeType = 'race'

        beforeEach( ()=>{
            cm = new AdvSmartTrainerCyclingMode(adapter);
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


})