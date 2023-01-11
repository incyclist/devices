import { EventLogger } from 'gd-eventlog';
import DaumPremiumAdapter from './DaumPremiumAdapter'
import DaumPremiumProtocol from './DaumPremiumProtocol'

import {Daum8iSerial as BikeInterface} from './bike'

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

describe( 'DaumPremiumAdapter', ()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined as any)

    })

    describe('check',()=>{
        test('a',()=>{})
    })
    describe('start',()=>{})
    describe('updateData',()=>{})
    describe('getCurrentBikeData',()=>{})

    describe('stop' ,()=>{
        let a: DaumPremiumAdapter;
        let bikeComms:any;
    
        beforeEach( async ()=>{
            bikeComms = new BikeInterface({port:'COMX'})   
            bikeComms.setSlope = jest.fn( (slope,bike=0)=>({bike,slope}))
            bikeComms.setPower = jest.fn( (power,bike=0)=>({bike,power}));
            a = new DaumPremiumAdapter( new DaumPremiumProtocol(),bikeComms);
        })


        test('not stopped',  async ()=>{
            a.logger.logEvent  = jest.fn()
            a.stopped = false;
            const res = await a.stop()
            expect(res).toBeTruthy()
            expect(a.stopped).toBeTruthy()

    
        })

        test('already stopped',  async ()=>{
            a.logger.logEvent  = jest.fn()
            a.stopped = true;
            const res = await a.stop()
            expect(res).toBeTruthy()
            expect(a.stopped).toBeTruthy()

    
        })


    })

})