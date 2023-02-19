import WahooAdapter,{OpCode} from './comms'
import {MockLogger} from '../../../test/logger'

describe ( 'WahooAdvancedFmAdapter',()=>{

    describe( 'setSimGrade', ()=> {
        test('0%',async ()=>{
            const c = new WahooAdapter({logger:MockLogger});
            c.writeWahooFtmsMessage = jest.fn();

            await c.setSimGrade(0)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('0080','hex'))

        })

        test('-100%',async ()=>{
            const c = new WahooAdapter({logger:MockLogger});
            c.writeWahooFtmsMessage = jest.fn();

            await c.setSimGrade(-100)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('0000','hex'))

        })
        test('-0.5%',async ()=>{
            const c = new WahooAdapter({logger:MockLogger});
            c.writeWahooFtmsMessage = jest.fn();

            await c.setSimGrade(-0.5)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('5c7f','hex'))

        })

        test('2%',async ()=>{
            const c = new WahooAdapter({logger:MockLogger});
            c.writeWahooFtmsMessage = jest.fn();

            await c.setSimGrade(2)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('8f82','hex'))

        })

        test('8%',async ()=>{
            const c = new WahooAdapter({logger:MockLogger});
            c.writeWahooFtmsMessage = jest.fn();

            await c.setSimGrade(8)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('3d8a','hex'))

        })


        test('< -100%',async ()=>{
            const c = new WahooAdapter({logger:MockLogger});
            c.writeWahooFtmsMessage = jest.fn();

            await c.setSimGrade(-125)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('0000','hex'))

        })

        test('100%',async ()=>{
            const c = new WahooAdapter({logger:MockLogger});
            c.writeWahooFtmsMessage = jest.fn();

            await c.setSimGrade(100)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('ffff','hex'))

        })

        test('> 100%',async ()=>{
            const c = new WahooAdapter({logger:MockLogger});
            c.writeWahooFtmsMessage = jest.fn();

            await c.setSimGrade(180)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('FFFF','hex'))

        })

    })
})