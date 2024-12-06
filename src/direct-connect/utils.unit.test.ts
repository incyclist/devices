import {parseUUID,beautifyUUID} from './utils'
describe ('utils', () => {  
    describe ('parseUUID', () => {
        test('hex 16Bit', () => {
            const res = parseUUID('0xABCD')
            expect(res).toBe('0000ABCD00001000800000805F9B34FB')
        })
        test('16Bit', () => {
            const res = parseUUID('ABCD')
            expect(res).toBe('0000ABCD00001000800000805F9B34FB')
        })

        test('hex 32Bit', () => {
            const res = parseUUID('0x1234ABCD')
            expect(res).toBe('1234ABCD00001000800000805F9B34FB')
        })
        test('32Bit', () => {
            const res = parseUUID('1234ABCD')
            expect(res).toBe('1234ABCD00001000800000805F9B34FB')
        })
        test('128Bit', () => {
            const res = parseUUID('1234ABCD00001000800000805F9B34FB')
            expect(res).toBe('1234ABCD00001000800000805F9B34FB')
        })
        test('full', () => {
            const res = parseUUID('1234ABCD-0000-1000-8000-00805F9B34FB')
            expect(res).toBe('1234ABCD00001000800000805F9B34FB')
        })
        test('lower case', () => {
            const res = parseUUID('1234abcd-0000-1000-8000-00805f9b34fb')
            expect(res).toBe('1234ABCD00001000800000805F9B34FB')
        })
    })

    describe('beatifyUUID', () => { 
        test('hex 32Bit', () => {
            const res = beautifyUUID('1234ABCD00001000800000805F9B34FB')
            expect(res).toBe('1234ABCD')
        })

        test('hex 16Bit', () => {
            const res = beautifyUUID('0000ABCD00001000800000805F9B34FB')
            expect(res).toBe('ABCD')
        })

        test('full', () => {
            const res = beautifyUUID('0000ABCD00002000800000805F9B34FB')
            expect(res).toBe('0000ABCD-0000-2000-8000-00805F9B34FB')
        })

    })
})