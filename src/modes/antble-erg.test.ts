import BleERGCyclingMode from "./antble-erg"
import MockAdapter from '../../test/mock-adapter';

let adapter = new MockAdapter()

describe('BLE-ERG',()=>{

    beforeAll( () => {
        jest.useFakeTimers();
    })
    afterAll( () => {
        jest.useRealTimers();
    })

    test('statics',()=>{
        const m = new BleERGCyclingMode(adapter)

        expect(m.getName()).toBe('ERG')
        expect(m.getDescription()).toMatchSnapshot()
        expect(m.getProperties()).toMatchSnapshot()

        expect(BleERGCyclingMode.supportsERGMode()).toBe(true)
    })

    describe ( 'getBikeInitRequest()',()=>{

        test('default',()=>{
            const cyclingMode = new BleERGCyclingMode(adapter); 
            const request = cyclingMode.getBikeInitRequest();
            expect( request ).toEqual( { targetPower: 50})
        })
        test('startPower set',()=>{
            const cyclingMode = new BleERGCyclingMode(adapter); 

            cyclingMode.getSetting = jest.fn(  (v) => v==='startPower' ? 110: undefined );
            let request = cyclingMode.getBikeInitRequest();
            expect( request ).toEqual( { targetPower: 110})

            // also test variable to be set as String
            cyclingMode.getSetting = jest.fn(  (v) => v==='startPower' ? '110': undefined );
            request = cyclingMode.getBikeInitRequest();
            expect( request ).toEqual( { targetPower: 110})
        })

    })

    describe('sendUpdate',()=>{

        let cm;
        beforeEach( ()=>{
            cm = new BleERGCyclingMode(adapter);
            cm.getSetting = jest.fn( (key) => { 
                if (key==='startPower') return 100
                if (key==='bikeType') return 'Race'
            });

        })

        test('starting',()=>{

            let res;
            
            res = cm.sendBikeUpdate({ targetPower:100})
            expect(res).toEqual({targetPower:100})

            jest.advanceTimersByTime(1000);
            cm.updateData({time:0,slope:0,speed:3,isPedalling:true,power:100,distanceInternal:0,pedalRpm:11,heartrate:216,gear:10})
            res = cm.sendBikeUpdate({ refresh:true})
            expect(res).toEqual({targetPower:100});
        })
  

        test('resetting',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ targetPower:120})
            expect(res).toEqual({targetPower:120})
            expect(cm.prevRequest).toEqual({targetPower:120})

            res = cm.sendBikeUpdate({ reset:true})
            expect(res).toEqual({reset:true});
            expect(cm.prevRequest).toEqual({})

        })

        test('empty request repeats last request',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ targetPower:120})
            expect(res).toEqual({targetPower:120})

            res = cm.sendBikeUpdate({})
            expect(res).toEqual({targetPower:120})
        })

        test('empty request at start',()=>{
            let res;
            
            res = cm.sendBikeUpdate({})
            expect(res).toEqual({})

        })

        test('setting slope, triggers prev target to be sent again',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ targetPower:120})
            expect(res).toEqual({targetPower:120})

            res = cm.sendBikeUpdate({slope:10})
            expect(res).toEqual({targetPower:120})
            expect(cm.getSlope()).toBe(10)
        })


        test('setting slope and targetPower will update',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ targetPower:120})
            expect(res).toEqual({targetPower:120})

            res = cm.sendBikeUpdate({slope:10, targetPower:300})
            expect(res).toEqual({targetPower:300})
            expect(cm.getSlope()).toBe(10)
        })

        test('setting minPower below target will resend prev target',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ targetPower:120})
            expect(res).toEqual({targetPower:120})

            res = cm.sendBikeUpdate({minPower:25})
            expect(res).toEqual({minPower:25,targetPower:120})
            
        })

        test('setting minPower above target cause target udpate',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ targetPower:120})
            expect(res).toEqual({targetPower:120})

            res = cm.sendBikeUpdate({minPower:125})
            expect(res).toEqual({minPower:125,targetPower:125})          
        })

        test('setting maxPower below target cause target udpate',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ targetPower:120})
            expect(res).toEqual({targetPower:120})

            res = cm.sendBikeUpdate({maxPower:75})
            expect(res).toEqual({maxPower:75,targetPower:75})          
        })


        test('setting minPower=maxPower causes target udpate',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ targetPower:120})
            expect(res).toEqual({targetPower:120})

            res = cm.sendBikeUpdate({minPower:200,maxPower:200})
            expect(res).toEqual({targetPower:200,minPower:200,maxPower:200})
            
        })

        test('setting temporary updates',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ targetPower:120})
            expect(res).toEqual({targetPower:120})

            res = cm.sendBikeUpdate({targetPowerDelta:10})
            expect(res).toEqual({targetPower:130})

            res = cm.sendBikeUpdate({targetPowerDelta:-200})
            expect(res).toEqual({targetPower:130})
            

        })


    })


    describe('updateData',()=>{

        let cm;
        let bikeType = 'race'

        beforeEach( ()=>{
            cm = new BleERGCyclingMode(adapter);
            cm.getSetting = jest.fn( (key) => { 
                if (key==='startPower') return 100
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