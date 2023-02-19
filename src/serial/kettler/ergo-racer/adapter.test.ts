import KettlerRacerAdapter from './adapter';
import { EventLogger } from 'gd-eventlog';
import {MockLogger} from '../../../../test/logger'
import { KettlerRacerMock, KettlerRacerMockImpl } from './mock';
import { SerialPortProvider } from '../..';
import { MockBinding } from '@serialport/binding-mock';

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

interface CounterHashMap  {
    [msg: string] : number;
}

let resLookup: CounterHashMap = {}

describe( 'ErgoRacerAdapter', () => {

    beforeAll( ()=> {
        const tsStart = Date.now()
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log( Date.now()-tsStart,event) } )
        //jest.useFakeTimers();
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( MockLogger)
        jest.useRealTimers();
    })

    describe( 'parseStatus',()=>{

        test('initial data',()=>{
            const ad = new KettlerRacerAdapter( {interface:'serial',name:'test',port:'COM1', protocol:'Kettler Racer'});
            const res = ad.parseStatus('000\t000\t000\t000\t100\t0000\t00:04\t000')
            expect(res).toMatchObject({cadence:0, distance:0, speed:0, power:0, heartrate:0, time:4, energy:0, requestedPower:100})
        })

        test('with distance',()=>{
            const ad = new KettlerRacerAdapter( {interface:'serial',name:'test',port:'COM1', protocol:'Kettler Racer'});
            const res = ad.parseStatus('000\t075\t266\t001\t070\t0012\t00:36\t065')
            expect(res).toMatchObject({cadence:75, distance:100, speed:26.6, power:65, heartrate:0, time:36, energy:12, requestedPower:70})
        })
        test('too short',()=>{
            const ad = new KettlerRacerAdapter( {interface:'serial',name:'test',port:'COM1', protocol:'Kettler Racer'});
            const res = ad.parseStatus('000\t075\t266\t001\t070\t0012\t00:36')
            expect(res).toEqual({})
        })

    })


    describe( 'mapData',()=>{

        test('initial data',()=>{
            const ad = new KettlerRacerAdapter( {interface:'serial',name:'test',port:'COM1', protocol:'Kettler Racer'});
            const res = ad.mapData({cadence:0, distance:0, speed:0, power:0, heartrate:0, time:4, energy:0, requestedPower:100,timestamp:Date.now()})
            expect(res).toMatchObject({isPedalling:false, pedalRpm:0, distanceInternal:0, speed:0, power:0, heartrate:0, time:4})
        })
        test('with distance',()=>{
            const ad = new KettlerRacerAdapter( {interface:'serial',name:'test',port:'COM1', protocol:'Kettler Racer'});
            const res = ad.mapData({cadence:75, distance:100, speed:26.6, power:65, heartrate:0, time:36, energy:12, requestedPower:70})
            expect(res).toMatchObject({isPedalling:true, pedalRpm:75, distanceInternal:100, speed:26.6, power:65, heartrate:0, time:36 })
        })

    })


    describe('integration tests',()=>{

        let ad;
        let comms;
        let open
        beforeAll( ()=> {
            KettlerRacerMockImpl.reset()
            SerialPortProvider.getInstance().setBinding('serial', KettlerRacerMock)
        })

        afterEach( async ()=>{
            if (ad )
                await ad.close()
        })
    
    
        beforeEach( async ()=> {
            MockBinding.reset();
            MockBinding.createPort('COM1')
            ad = new KettlerRacerAdapter( {interface:'serial',name:'test',port:'COM1', protocol:'Kettler Racer'});
        })

        test('check',async ()=>{
            const available = await ad.check()
            expect(available).toBeTruthy()
        })
    
    })



    
})