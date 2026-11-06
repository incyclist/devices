import { CscMeasurement } from './measurement.js'
import { CrankCadenceCalculator } from '../../crank-cadence.js'

describe('CSC crank measurement regression', () => {
    const samples = ['020800a52b','0209001633','020a003238','020b00f93c','020c00b141','020d004f46','020e00e74a','020f00c852'].map(s => Buffer.from(s,'hex'))
    test('crank-only fields and cadence for the supplied samples', () => {
        const parser = new CscMeasurement()
        const expected = [undefined, 32.3, 47.0, 50.2, 50.9, 52.0, 52.2, 30.5]
        const times = [11173,13078,14386,15609,16817,17999,19175,21192]
        samples.forEach((sample, i) => {
            expect(sample[0]).toBe(2)
            expect(sample.readUInt16LE(1)).toBe(8+i)
            expect(sample.readUInt16LE(3)).toBe(times[i])
            const data = parser.parse(sample)
            expect(data.speed).toBeUndefined()
            if (i===0) expect(data.cadence).toBeUndefined()
            else expect(data.cadence).toBeCloseTo(expected[i]!, 0)
        })
    })
    test('repeated measurements eventually produce zero and resume', () => {
        const parser = new CscMeasurement()
        parser.parse(samples[0]); parser.parse(samples[1])
        for (let i=0;i<4;i++) parser.parse(samples[1])
        expect(parser.parse(samples[1]).cadence).toBe(0)
        expect(parser.parse(samples[2]).cadence).toBeCloseTo(47, 0)
    })
    test('both 16-bit counters wrap', () => {
        const c = new CrankCadenceCalculator(true)
        c.update({revolutions:65535,time:65024})
        expect(c.update({revolutions:0,time:512}).rpm).toBe(60)
    })
})
