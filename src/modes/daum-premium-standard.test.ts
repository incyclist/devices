import DaumClassicMode from "./daum-premium-standard"
import MockAdapter from '../../test/mock-adapter';

let adapter = new MockAdapter()

describe('DaumPremium - Standard',()=>{

    beforeAll( () => {
        jest.useFakeTimers();
    })
    afterAll( () => {
        jest.useRealTimers();
    })

    test('statics',()=>{
        const m = new DaumClassicMode(adapter)

        expect(m.getName()).toBe('Daum Classic')
        expect(m.getDescription()).toMatchSnapshot()
        expect(m.getProperties()).toMatchSnapshot()
        expect(DaumClassicMode.supportsERGMode()).toBe(false)        
    })

    describe ( 'getBikeInitRequest()',()=>{

        test('default',()=>{
            const cyclingMode = new DaumClassicMode(adapter); 
            const request = cyclingMode.getBikeInitRequest();
            expect( request ).toEqual( {})
        })
    })

    describe('sendUpdate',()=>{

        let cm;
        let bikeType = 'Race'

        beforeEach( ()=>{
            cm = new DaumClassicMode(adapter);
            cm.getSetting = jest.fn( (key) => { 
                if (key==='bikeType') return bikeType
            });

        })

        test('starting',()=>{

            let res;
            
            res = cm.sendBikeUpdate({ slope:1})
            expect(res).toEqual({})
            expect(cm.getSlope()).toBe(1)

            jest.advanceTimersByTime(1000);
            cm.updateData({time:0,slope:0,speed:3,isPedalling:true,power:100,distanceInternal:0,pedalRpm:11,heartrate:216,gear:10})
            res = cm.sendBikeUpdate({ refresh:true})
            expect(res).toEqual({});
            
        })
  

        test('resetting',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ slope:1})
            expect(res).toEqual({})

            res = cm.sendBikeUpdate({ reset:true})
            expect(res).toEqual({});
            expect(cm.prevRequest).toEqual({})

        })

        test('empty request repeats last request',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ slope:2})
            expect(res).toEqual({})

            res = cm.sendBikeUpdate({})
            expect(res).toEqual({})
        })

        test('empty request at start',()=>{
            let res;
            
            res = cm.sendBikeUpdate({})
            expect(res).toEqual({})

        })

        test('setting targetPower, triggers prev target to be sent again',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ slope:1})
            expect(res).toEqual({})

            res = cm.sendBikeUpdate({targetPower:120})
            expect(res).toEqual({})
        })



        test('setting minPower will resend prev target',()=>{
            let res;

            res = cm.sendBikeUpdate({ slope:1})
            expect(res).toEqual({})
            
            res = cm.sendBikeUpdate({minPower:25})
            expect(res).toEqual({})
            
        })

        test('setting maxPower will resend prev target',()=>{
            let res;

            res = cm.sendBikeUpdate({ slope:1})
            expect(res).toEqual({})
            
            res = cm.sendBikeUpdate({maxPower:125})
            expect(res).toEqual({})
            
        })


        test('setting minPower=maxPower will resend prev target',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ slope:1})
            expect(res).toEqual({})
            
            res = cm.sendBikeUpdate({minPower:125,maxPower:125})
            expect(res).toEqual({})
            
        })

        test('setting temporary updates  will resend prev target',()=>{
            let res;
            
            res = cm.sendBikeUpdate({ slope:1})
            expect(res).toEqual({})

            res = cm.sendBikeUpdate({targetPowerDelta:10})
            expect(res).toEqual({})

        })


    })


    describe('updateData',()=>{

        let cm;
        let bikeType = 'race'

        beforeEach( ()=>{
            cm = new DaumClassicMode(adapter);
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
            const res = cm.updateData({power:10,pedalRpm:8,speed:8,isPedalling:true,distanceInternal:2.2})
            expect(res).toMatchObject({power:10,pedalRpm:8,speed:8,time:1,distanceInternal:expect.closeTo(2.2,1)})
        })


        test('stopped cycling, current speed below MIN and prev speed<1',()=>{
            cm.getData = jest.fn().mockReturnValue({speed:1, power:0, time:1})

            const res = cm.updateData({power:0,pedalRpm:0,speed:8})
            expect(res).toMatchObject({power:0,pedalRpm:0,speed:0,time:1})
        })
        test('stopped cycling, current speed below MIN and prev speed>1',()=>{
            cm.getData = jest.fn().mockReturnValue({speed:9, power:0, time:1})

            const res = cm.updateData({power:0,pedalRpm:0,speed:8})
            expect(res).toMatchObject({power:0,pedalRpm:0,speed:0,time:1})
        })

        test('bikeType race',()=>{
            cm.getData = jest.fn().mockReturnValue({speed:30, power:100, time:1,slope:1})
            bikeType = 'race'
            const res = cm.updateData({power:100,pedalRpm:90,speed:31})
            expect(res).toMatchObject({speed:31,time:2})
        })
        test('bikeType mountain',()=>{
            cm.getData = jest.fn().mockReturnValue({speed:30, power:100, time:1,slope:1})
            bikeType = 'mountain'
            const res = cm.updateData({power:100,pedalRpm:90,speed:31})
            expect(res).toMatchObject({speed:31,time:2})
        })

    })

})