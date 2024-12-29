import WahooSensor from './sensor'
import {MockLogger} from '../../../test/logger'
import { OpCode } from './consts'

describe ( 'WahooAdvancedFmAdapter',()=>{

    describe( 'setSimGrade', ()=> {

        let c

        beforeEach( ()=>{
            c = new WahooSensor({logger:MockLogger});
            c.writeWahooFtmsMessage = jest.fn();
        })

        test('0%',async ()=>{

            await c.setSimGrade(0)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('0080','hex'))

        })

        test('-100%',async ()=>{

            await c.setSimGrade(-100)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('0000','hex'))

        })
        test('-0.5%',async ()=>{

            await c.setSimGrade(-0.5)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('5c7f','hex'))

        })

        test('2%',async ()=>{

            await c.setSimGrade(2)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('8f82','hex'))

        })

        test('8%',async ()=>{

            await c.setSimGrade(8)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('3d8a','hex'))

        })


        test('< -100%',async ()=>{

            await c.setSimGrade(-125)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('0000','hex'))

        })

        test('100%',async ()=>{

            await c.setSimGrade(100)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('ffff','hex'))

        })

        test('> 100%',async ()=>{
  
            await c.setSimGrade(180)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('FFFF','hex'))

        })

    })

    describe( 'onData',()=> {

        test('CSP DATA',async ()=>{

            const dataSpy = jest.fn();
            const c = new WahooSensor({logger:MockLogger});
            c.on('data',dataSpy)
            const data = Buffer.from( '14000000000000000000d503','hex') 
            c.onData('0x2a63',data)

            expect(dataSpy).toHaveBeenCalledWith({instantaneousPower:0,raw:'14000000000000000000d503'})            

        })
    })
})