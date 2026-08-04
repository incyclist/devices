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
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('0080','hex'),{timeout:800})

        })

        test('-100%',async ()=>{

            await c.setSimGrade(-100)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('0000','hex'),{timeout:800})

        })
        test('-0.5%',async ()=>{

            await c.setSimGrade(-0.5)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('5c7f','hex'),{timeout:800})

        })

        test('2%',async ()=>{

            await c.setSimGrade(2)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('8f82','hex'),{timeout:800})

        })

        test('8%',async ()=>{

            await c.setSimGrade(8)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('3d8a','hex'),{timeout:800})

        })


        test('< -100%',async ()=>{

            await c.setSimGrade(-125)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('0000','hex'),{timeout:800})

        })

        test('100%',async ()=>{

            await c.setSimGrade(100)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('ffff','hex'),{timeout:800})

        })

        test('> 100%',async ()=>{

            await c.setSimGrade(180)
            expect(c.writeWahooFtmsMessage).toHaveBeenCalledWith(OpCode.setSimGrade,Buffer.from('FFFF','hex'),{timeout:800})

        })

    })

    describe( 'onData',()=> {

        test('CSP DATA',async ()=>{

            const dataSpy = jest.fn();
            const c = new WahooSensor({logger:MockLogger});
            c.on('data',dataSpy)
            const data = Buffer.from( '14000000000000000000d503','hex')
            c.onData('0x2a63',data)

            expect(dataSpy).toHaveBeenCalledWith({instantaneousPower:0,raw:'2a63:14000000000000000000d503'})

        })
    })

    // bug repro: a KICKR SNAP acks 'unlock' but never sends a notify for setSimMode (opcode 0x43) -
    // writeWahooFtmsMessage() previously had no way to bound that wait at all, so setSlope() (called
    // from initControl()'s sendInitialRequest() step) hung forever, silently consuming the whole 30s
    // pairing window even while the trainer was already connected and streaming real power data.
    describe( 'writeWahooFtmsMessage bounded timeout (setSimMode never notifies)', ()=> {

        let c

        beforeEach( ()=>{
            c = new WahooSensor({logger:MockLogger});
            c.logEvent = jest.fn()
        })

        test('a dedicated write timeout aborts the underlying write() call, and resolves to false',async ()=>{
            let capturedSignal: AbortSignal|undefined
            c.write = jest.fn().mockImplementation( (_uuid:string,_message:Buffer,options:any) => {
                capturedSignal = options?.signal
                return new Promise<Buffer>( ()=>{} )   // never settles - simulates a missing GATT notify
            })

            const data = Buffer.alloc(6)
            const result = await c.writeWahooFtmsMessage(OpCode.setSimMode, data, {timeout:20})

            expect(result).toBe(false)
            expect(capturedSignal).toBeInstanceOf(AbortSignal)
            expect(capturedSignal!.aborted).toBe(true)
        })

        test('setSlope() completes well within the timeout budget (not 30s) when the trainer acks unlock but never notifies on setSimMode',async ()=>{
            const ackUnlock = Buffer.from([1])   // OpCodeResult success byte the Wahoo CP replies with

            c.write = jest.fn().mockImplementation( (_uuid:string, message:Buffer) => {
                const opcode = message.readUInt8(0)
                if (opcode===OpCode.unlock) {
                    return Promise.resolve(ackUnlock)
                }
                // setSimMode (and anything else): trainer never notifies - simulates the KICKR SNAP
                return new Promise<Buffer>( ()=>{} )
            })

            const start = Date.now()
            const result = await c.setSlope(5)
            const duration = Date.now()-start

            // bounded by the per-write timeout (800ms) instead of hanging until the outer 30s pairing
            // budget is exhausted
            expect(duration).toBeLessThan(5000)
            // setSimMode never got acked -> setSlope() reports failure, but resolves rather than hangs
            expect(result).toBe(false)
            // the setSimMode write was genuinely attempted (and given up on), not skipped
            const simModeCall = c.write.mock.calls.find( ([,message]:[string,Buffer]) => message.readUInt8(0)===OpCode.setSimMode)
            expect(simModeCall).toBeDefined()
        }, 10000)

    })
})