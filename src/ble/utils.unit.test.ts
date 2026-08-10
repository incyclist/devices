import { isSameServiceFamily } from './utils'

describe('isSameServiceFamily (FIXES_BACKLOG #26)', () => {

    test('identical standard (short-form) UUIDs match', () => {
        expect(isSameServiceFamily('180D', '180D')).toBe(true)
    })

    test('different standard (short-form) UUIDs do not match', () => {
        expect(isSameServiceFamily('180D', '1814')).toBe(false)
    })

    test('identical custom 128-bit UUIDs match', () => {
        const uuid = 'A0260001-0A7D-4AB3-97FA-F1500F9FEB8B'
        expect(isSameServiceFamily(uuid, uuid)).toBe(true)
    })

    // The real-world defect this function fixes: vendors mint a private UUID "family" from one
    // base UUID with only the first 32 bits varying (see the comment on isSameServiceFamily()) -
    // an advertisement and the live GATT table can legitimately expose different members of that
    // same family.
    test('custom 128-bit UUIDs sharing the same last-96-bit base match despite a different prefix (TICKR FIT)', () => {
        const announced = 'A0260001-0A7D-4AB3-97FA-F1500F9FEB8B'
        const discovered = 'A026EE01-0A7D-4AB3-97FA-F1500F9FEB8B'
        expect(isSameServiceFamily(announced, discovered)).toBe(true)
    })

    test('custom 128-bit UUIDs sharing the same last-96-bit base match despite a different prefix (HRM Pro+)', () => {
        const announced = '6A4E3E10-667B-11E3-949A-0800200C9A66'
        const discovered = '6A4E2401-667B-11E3-949A-0800200C9A66'
        expect(isSameServiceFamily(announced, discovered)).toBe(true)
    })

    test('custom 128-bit UUIDs with a genuinely different base do not match', () => {
        const a = 'A0260001-0A7D-4AB3-97FA-F1500F9FEB8B'
        const b = 'DEADBEEF-1111-2222-3333-444455556666'
        expect(isSameServiceFamily(a, b)).toBe(false)
    })

    test('a custom 128-bit UUID never matches a standard short-form UUID', () => {
        const custom = 'A0260001-0A7D-4AB3-97FA-F1500F9FEB8B'
        expect(isSameServiceFamily(custom, '180D')).toBe(false)
        expect(isSameServiceFamily('180D', custom)).toBe(false)
    })

    test('is case-insensitive', () => {
        const announced = 'a0260001-0a7d-4ab3-97fa-f1500f9feb8b'
        const discovered = 'A026EE01-0A7D-4AB3-97FA-F1500F9FEB8B'
        expect(isSameServiceFamily(announced, discovered)).toBe(true)
    })

})
