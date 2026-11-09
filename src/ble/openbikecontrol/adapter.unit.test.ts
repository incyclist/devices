import { OpenBikeControlAdapter } from './adapter'

describe('OpenBikeControlAdapter', () => {

    const settings = (extra = {}) => ({ interface: 'wifi', name: 'BikeControl', protocol: 'openbikecontrol', address: '10.0.0.7', ...extra }) as any

    test('start does not wait for data, as controllers only send data when a button is pressed', () => {
        const adapter: any = new OpenBikeControlAdapter(settings())
        expect(adapter.shouldWaitForData()).toBe(false)
    })

    test('controllers with the same name but different addresses are different devices', () => {
        const adapter = new OpenBikeControlAdapter(settings())
        expect(adapter.isEqual(settings())).toBe(true)
        expect(adapter.isEqual(settings({ address: '10.0.0.8' }))).toBe(false)
        expect(adapter.isSame(new OpenBikeControlAdapter(settings({ address: '10.0.0.8' })))).toBe(false)
    })

    test('the name contains the end of the address', () => {
        expect(new OpenBikeControlAdapter(settings()).getName()).toBe('BikeControl 0007')
        expect(new OpenBikeControlAdapter(settings({ interface: 'ble', address: 'aa:bb:cc:dd:ee:ff' })).getName()).toBe('BikeControl EEFF')
    })
})
