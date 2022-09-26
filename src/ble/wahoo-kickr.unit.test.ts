import WahooAdapter,{OpCode} from './wahoo-kickr'
import {MockLogger} from '../../test/logger'

describe ( 'WahooAdvancedFmAdapter',()=>{

    describe( 'setSimGrade', ()=> {
        test('0%',async ()=>{
            const c = new WahooAdapter({logger:MockLogger});
            c.writeWahooFtmsMessage = jest.fn();

            await c.setSimGrade(0)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('0000','hex'))

        })

        test('-100%',async ()=>{
            const c = new WahooAdapter({logger:MockLogger});
            c.writeWahooFtmsMessage = jest.fn();

            await c.setSimGrade(-100)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('0080','hex'))

        })

        test('< -100%',async ()=>{
            const c = new WahooAdapter({logger:MockLogger});
            c.writeWahooFtmsMessage = jest.fn();

            await c.setSimGrade(-125)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('0080','hex'))

        })

        test('100%',async ()=>{
            const c = new WahooAdapter({logger:MockLogger});
            c.writeWahooFtmsMessage = jest.fn();

            await c.setSimGrade(100)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('FF7F','hex'))

        })

        test('> 100%',async ()=>{
            const c = new WahooAdapter({logger:MockLogger});
            c.writeWahooFtmsMessage = jest.fn();

            await c.setSimGrade(180)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('FF7F','hex'))

        })

    })
})