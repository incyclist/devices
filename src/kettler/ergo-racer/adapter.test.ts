import ErgoRaceAdapter from './adapter';
import { EventLogger } from 'gd-eventlog';
import ErgoRacerProtocol from './protocol';
import { SendState, SerialCommsState } from '../comms';
import { Command } from '../../types/command';

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

describe( 'ErgoRacerAdapter', () => {

    beforeAll( ()=> {
        const tsStart = Date.now()
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log( Date.now()-tsStart,event) } )
        //jest.useFakeTimers();
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined)
        //jest.useRealTimers();
    })

    test('start',async ()=>{
        const protocol = new ErgoRacerProtocol();
        const ad = new ErgoRaceAdapter(protocol, {name:'test',port:'COM1'});
        
        ad.waitForOpened = jest.fn( ()=> Promise.resolve(true) )
        ad.waitForClosed = jest.fn( ()=> Promise.resolve(true) )
        ad.setClientMode = jest.fn( ()=> Promise.resolve(true) )
        ad.getIdentifier = jest.fn( ()=> Promise.resolve('AR1S') )
        ad.getVersion = jest.fn( ()=> Promise.resolve('018') )
        ad.getInterface = jest.fn( ()=> Promise.resolve('ERROR') )
        ad.getStatus = jest.fn( ()=> { console.log('ST'); return  Promise.resolve( {time:0, power:0})} )
        ad.setPower = jest.fn( ()=> Promise.resolve({time:0, power:0})) 
        //ad.startUpdatePull = jest.fn( ()=> Promise.resolve(true) )
        ad.startTraining = jest.fn( ()=> Promise.resolve('ERROR') )
  
        await ad.start();
        //expect(ad.startUpdatePull).toHaveBeenCalledTimes(1);

        // wait 10s
        await new Promise( (resolve)=> setTimeout(resolve,10000) )
       

    },10000)


    test('start1',async ()=>{
        const protocol = new ErgoRacerProtocol();
        const ad = new ErgoRaceAdapter(protocol, {name:'test',port:'COM1'});
        const comms = ad._getComms();
        comms.open = jest.fn( ()=> { comms.onPortOpen(); }) // console.log('~~open'); comms._setState(SerialCommsState.Connected);comms.emit('opened');} )
        comms.close = jest.fn( ()=> {  comms._setState(SerialCommsState.Disconnected); comms.emit('closed');} )


        const responses = [ 
            {cmd:'CM',data:'ACK'},
            {cmd:'ID',data:'AR1S'},
            {cmd:'VE',data:'018'},
            {cmd:'KI',data:'ERROR'},
            {cmd:'LB',data:'ERROR'},
            {cmd:'IF',data:'ERROR'},
            {cmd:'ST',data:'000       042     149     000     100     0002    00:20   030'},
            {cmd:'PW100',data:'000       042     149     000     100     0002    00:20   030'},
            {cmd:'ST',data:'0,0'},                            
        ]
       
        comms.write = jest.fn( (cmd: Command)=> {
                const msg = cmd.message
                comms._setCurrentCmd(cmd);
                const res = responses.find ( (r)=> r.cmd===msg );
                comms.getLogger().logEvent({message:"sendCommand:sending:",cmd:cmd.logStr, msg, port:comms.getPort()});                        

                if (res) {

                    comms._setSendState(SendState.Receiving);
                    comms.onData(res.data);
                }
                else {
                    comms._setSendState(SendState.Idle);
                    if (cmd.onError)
                        cmd.onError(new Error("response timeout"));
                }

        } )
        
  
        await ad.start();
        //expect(ad.startUpdatePull).toHaveBeenCalledTimes(1);

        // wait 10s
        await new Promise( (resolve)=> setTimeout(resolve,10000) )
       

    },100000)


    
})