import KettlerRacerAdapter from './adapter';
import { EventLogger } from 'gd-eventlog';
import ErgoRacerProtocol from './protocol';
import { SendState, SerialCommsState } from '../comms';
import { Command } from '../../types/command';
import {MockLogger} from '../../../test/logger'

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

interface CounterHashMap  {
    [msg: string] : number;
}

let resLookup: CounterHashMap = {}
const MockComms = ( ad:KettlerRacerAdapter, responseMap ) => {
    const comms = ad._getComms();
    comms.open = jest.fn( ()=> { comms.onPortOpen(); }) 
    comms.close = jest.fn( ()=> {  comms._setState(SerialCommsState.Disconnected); comms.emit('closed');} )
    comms.write = jest.fn( (cmd: Command)=> {
        const msg = cmd.message
        comms._setCurrentCmd(cmd);
        const res = responseMap.find ( (r)=> r.cmd===msg );
        comms.getLogger().logEvent({message:"sendCommand:sending:",cmd:cmd.logStr, msg, port:comms.getPort()});                        

        if (res) {

            comms._setSendState(SendState.Receiving);
            if ( typeof res.data === 'string') 
                comms.onData(res.data);
            if ( Array.isArray(res.data))  {
                let cnt =  resLookup[res.cmd]!==undefined ?  resLookup[res.cmd] : -1;
                resLookup[res.cmd] = ++cnt;
                comms.onData( res.data[cnt % res.data.length] );
            }
        }
        else {
            comms._setSendState(SendState.Idle);
            if (cmd.onError)
                cmd.onError(new Error("response timeout"));
        }

    })


}

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
            const ad = new KettlerRacerAdapter(new ErgoRacerProtocol(), {name:'test',port:'COM1'});
            const res = ad.parseStatus('000\t000\t000\t000\t100\t0000\t00:04\t000')
            expect(res).toMatchObject({cadence:0, distance:0, speed:0, power:0, heartrate:0, time:4, energy:0, requestedPower:100})
        })

        test('with distance',()=>{
            const ad = new KettlerRacerAdapter(new ErgoRacerProtocol(), {name:'test',port:'COM1'});
            const res = ad.parseStatus('000\t075\t266\t001\t070\t0012\t00:36\t065')
            expect(res).toMatchObject({cadence:75, distance:100, speed:26.6, power:65, heartrate:0, time:36, energy:12, requestedPower:70})
        })
        test('too short',()=>{
            const ad = new KettlerRacerAdapter(new ErgoRacerProtocol(), {name:'test',port:'COM1'});
            const res = ad.parseStatus('000\t075\t266\t001\t070\t0012\t00:36')
            expect(res).toEqual({})
        })

    })


    describe( 'mapData',()=>{

        test('initial data',()=>{
            const ad = new KettlerRacerAdapter(new ErgoRacerProtocol(), {name:'test',port:'COM1'});
            const res = ad.mapData({cadence:0, distance:0, speed:0, power:0, heartrate:0, time:4, energy:0, requestedPower:100,timestamp:Date.now()})
            expect(res).toMatchObject({isPedalling:false, pedalRpm:0, distanceInternal:0, speed:0, power:0, heartrate:0, time:4})
        })
        test('with distance',()=>{
            const ad = new KettlerRacerAdapter(new ErgoRacerProtocol(), {name:'test',port:'COM1'});
            const res = ad.mapData({cadence:75, distance:100, speed:26.6, power:65, heartrate:0, time:36, energy:12, requestedPower:70})
            expect(res).toMatchObject({isPedalling:true, pedalRpm:75, distanceInternal:100, speed:26.6, power:65, heartrate:0, time:36 })
        })

    })


    describe.skip('integration tests',()=>{

        let ad;
        afterEach( ()=>{
            
        })

        test('start',async ()=>{
            const protocol = new ErgoRacerProtocol();
            ad = new KettlerRacerAdapter(protocol, {name:'test',port:'COM1'});
            ad.startUpdatePull = jest.fn();

            const onData = jest.fn();
            ad.onData(onData);
    
            const responses = [ 
                {cmd:'CM',data:'ACK'},
                {cmd:'ID',data:'AR1S'},
                {cmd:'VE',data:'018'},
                {cmd:'KI',data:'ERROR'},
                {cmd:'LB',data:'ERROR'},
                {cmd:'IF',data:'ERROR'},
                {cmd:'PW100',data:'000\t042\t149\t000\t100\t0002\t00:20\t030'},
                {cmd:'ST',data: [
                    '000\t000\t000\t000\t100\t0000\t00:04\t000',
                    '000\t028\t099\t000\t100\t0000\t00:05\t999',
                    '000\t041\t145\t001\t100\t0001\t00:06\t020',
                    '000\t045\t159\t001\t100\t0001\t00:07\t035'
                ]},                            
            ]
           
      
            MockComms(ad, responses);
      
            const res = await ad.start();
            expect(ad.startUpdatePull).toHaveBeenCalledTimes(1);
            expect(res).toMatchObject({heartrate:0, speed:0, distance:0, power:0, cadence:0, deviceTime:4, });

            jest.useFakeTimers();

            jest.advanceTimersByTime(1000);
            await ad.update();
            expect(ad.data).toMatchObject({heartrate:0, speed:57.6,  power:999, cadence:28, deviceTime:5, deviceDistanceCounter:0 });
            expect(ad.data.distance).toBeCloseTo(57.6/3.6,0)
            expect(ad.data.internalDistanceCounter).toBeCloseTo(57.6/3.6,0)
    
            jest.advanceTimersByTime(1000);
            await ad.update();
            expect(ad.data).toMatchObject({heartrate:0, speed:12.5,  power:20, cadence:41, deviceTime:6, deviceDistanceCounter:100  });
            expect(ad.data.distance).toBeCloseTo(12.5/3.6,0)
            expect(ad.data.internalDistanceCounter).toBeCloseTo(57.6/3.6 + 12.5/3.6,0)


            await ad.sendData();
            expect(onData).toHaveBeenLastCalledWith(ad.data);

        },100000)
    
    })



    
})