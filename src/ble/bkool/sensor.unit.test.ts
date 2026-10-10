import BleBkoolDevice from "./sensor";
import { BKOOL_CONTROL } from "./consts";
import { MockLogger } from "../../../test/logger";
import { CSP, CSP_MEASUREMENT } from "../consts";
import { BKOOL_SERVICE } from "./consts";

describe('Bkool Sensor', ()=>{

    describe('constructor', ()=>{
        test('statics and default features', ()=>{
            const c = new BleBkoolDevice(null, {id:'4711', logger:MockLogger})

            expect(c.getProfile()).toBe('Smart Trainer')
            expect(c.getProtocol()).toBe('bkool')
            expect(c.getServiceUUids()).toEqual([CSP, BKOOL_SERVICE])
            expect(c.features).toMatchObject({power:true, cadence:true, setPower:true, setSlope:true, setResistance:true})
        })
    })

    describe('isMatching', ()=>{
        test('requires both CSP and the Bkool service', ()=>{
            const c = new BleBkoolDevice(null, {logger:MockLogger})
            expect(c.isMatching([CSP, BKOOL_SERVICE])).toBe(true)
            expect(c.isMatching([CSP])).toBe(false)
            expect(c.isMatching([BKOOL_SERVICE])).toBe(false)
        })
    })

    describe('onData', ()=>{
        let sensor: BleBkoolDevice

        beforeEach(()=>{
            sensor = new BleBkoolDevice(null, {logger:MockLogger})
        })

        test('Cycling Power Measurement - power only', ()=>{
            const res = sensor.onData(CSP_MEASUREMENT, Buffer.from('0000c800','hex'))
            expect(res).toBe(false)
        })

        test('Cycling Power Measurement with crank data emits cadence', ()=>{
            sensor.onData(CSP_MEASUREMENT, Buffer.from([0x20,0,0x96,0,0,0,0x10,0x27]))
            const res = sensor.onData(CSP_MEASUREMENT, Buffer.from([0x20,0,0x96,0,0,0,0x11,0x4f]))
            expect(res).toBe(false)
        })

        test('unknown characteristic is ignored (returns true, no data event)', ()=>{
            const emitSpy = jest.fn()
            sensor.emit = emitSpy
            const res = sensor.onData(BKOOL_CONTROL, Buffer.from('3025ffffffffff00','hex'))
            expect(res).toBe(true)
            expect(emitSpy).not.toHaveBeenCalled()
        })
    })

    describe('requestControl', ()=>{
        let sensor: BleBkoolDevice
        let writeSpy

        beforeEach(()=>{
            sensor = new BleBkoolDevice(null, {logger:MockLogger})
            writeSpy = jest.fn().mockResolvedValue(undefined)
            sensor.write = writeSpy
        })

        test('sends the fixed 5-frame init sequence once, byte-for-byte matching bkoolbike.cpp', async ()=>{
            const res = await sensor.requestControl()

            expect(res).toBe(true)
            expect(writeSpy).toHaveBeenCalledTimes(5)
            expect(writeSpy).toHaveBeenNthCalledWith(1, BKOOL_CONTROL, Buffer.from('3025ffffffffff00','hex'), {withoutResponse:true})
            expect(writeSpy).toHaveBeenNthCalledWith(2, BKOOL_CONTROL, Buffer.from('3225ffffff1e7f00','hex'), {withoutResponse:true})
            expect(writeSpy).toHaveBeenNthCalledWith(3, BKOOL_CONTROL, Buffer.from('3325ffffff204e00','hex'), {withoutResponse:true})
            expect(writeSpy).toHaveBeenNthCalledWith(4, BKOOL_CONTROL, Buffer.from('374c1dff800c4621','hex'), {withoutResponse:true})
            expect(writeSpy).toHaveBeenNthCalledWith(5, BKOOL_CONTROL, Buffer.from('37ee16ff800c4621','hex'), {withoutResponse:true})
        })

        test('second call does not resend the init sequence', async ()=>{
            await sensor.requestControl()
            writeSpy.mockClear()

            const res = await sensor.requestControl()
            expect(res).toBe(true)
            expect(writeSpy).not.toHaveBeenCalled()
        })
    })

    describe('setTargetPower', ()=>{
        let sensor: BleBkoolDevice
        let writeSpy

        beforeEach(async ()=>{
            sensor = new BleBkoolDevice(null, {logger:MockLogger})
            writeSpy = jest.fn().mockResolvedValue(undefined)
            sensor.write = writeSpy
            await sensor.requestControl()
            writeSpy.mockClear()
        })

        test('150W -> FE-C page 0x31, quarter-watt resolution', async ()=>{
            const res = await sensor.setTargetPower(150)
            expect(res).toBe(true)
            expect(writeSpy).toHaveBeenCalledWith(BKOOL_CONTROL, Buffer.from([0x31,0x25,0xff,0xff,0xff,0xff,0x58,0x02]), {withoutResponse:true})
        })

        test('repeating the same value is a no-op', async ()=>{
            await sensor.setTargetPower(150)
            writeSpy.mockClear()

            const res = await sensor.setTargetPower(150)
            expect(res).toBe(true)
            expect(writeSpy).not.toHaveBeenCalled()
        })
    })

    describe('setSlope', ()=>{
        let sensor: BleBkoolDevice
        let writeSpy

        beforeEach(async ()=>{
            sensor = new BleBkoolDevice(null, {logger:MockLogger})
            writeSpy = jest.fn().mockResolvedValue(undefined)
            sensor.write = writeSpy
            await sensor.requestControl()
            writeSpy.mockClear()
        })

        test('0% -> FE-C page 0x33, raw=(0+200)*100=20000=0x4e20 LE', async ()=>{
            const res = await sensor.setSlope(0)
            expect(res).toBe(true)
            expect(writeSpy).toHaveBeenCalledWith(BKOOL_CONTROL, Buffer.from([0x33,0x25,0xff,0xff,0xff,0x20,0x4e,0xa0]), {withoutResponse:true})
        })

        test('5% -> raw=(5+200)*100=20500=0x5014 LE', async ()=>{
            const res = await sensor.setSlope(5)
            expect(res).toBe(true)
            expect(writeSpy).toHaveBeenCalledWith(BKOOL_CONTROL, Buffer.from([0x33,0x25,0xff,0xff,0xff,0x14,0x50,0xa0]), {withoutResponse:true})
        })
    })

    describe('setTargetResistanceLevel', ()=>{
        test('converts resistance to inclination at a 1/10 ratio, mirroring bkoolbike.cpp', async ()=>{
            const sensor = new BleBkoolDevice(null, {logger:MockLogger})
            sensor.setSlope = jest.fn().mockResolvedValue(true)

            await sensor.setTargetResistanceLevel(50)
            expect(sensor.setSlope).toHaveBeenCalledWith(5)
        })
    })

    describe('FTMS no-ops', ()=>{
        test('startRequest/stopRequest/PauseRequest/setTargetInclination are safe no-ops', async ()=>{
            const sensor = new BleBkoolDevice(null, {logger:MockLogger})
            expect(await sensor.startRequest()).toBe(true)
            expect(await sensor.stopRequest()).toBe(true)
            expect(await sensor.PauseRequest()).toBe(true)
            expect(await sensor.setTargetInclination(5)).toBe(true)
        })
    })

})
