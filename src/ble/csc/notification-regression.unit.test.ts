import { EventEmitter } from 'events'
import { beautifyUUID } from '../utils.js'
import { BlePeripheral } from '../base/peripheral.js'
import { BleCyclingSpeedCadenceDevice } from './sensor.js'
import { BleCSCAdapter } from './adapter.js'

class Characteristic extends EventEmitter {
    uuid = '2a5b'
    properties = ['notify']
    subscribe(callback:(err?:Error)=>void) { callback() }
}

async function setup(useCalculationMode = false) {
    const raw:any = new EventEmitter()
    raw.id = raw.address = 'AA:BB:CC:DD:EE:FF'
    raw.services = []
    const peripheral:any = new BlePeripheral({peripheral:raw, serviceUUIDs:['1816'], advertisement:{localName:'CSC sensor'}} as any)
    peripheral.connected = true
    peripheral.discoveredServiceUUIds = ['1816']
    peripheral.logEvent = () => {}
    const characteristic = new Characteristic()
    peripheral.characteristics = {[beautifyUUID('2a5b')]:characteristic}
    const sensor:any = new BleCyclingSpeedCadenceDevice(peripheral)
    sensor.logEvent = () => {}
    const adapter:any = new BleCSCAdapter({interface:'ble', protocol:'csc', name:'CSC sensor', id:raw.id, address:raw.address})
    adapter.device = sensor
    adapter.logEvent = () => {}
    adapter.canEmitData = () => true
    if (useCalculationMode) adapter.setCyclingMode('SpeedSensor')
    else adapter.isControllable = () => false
    const received:any[] = []
    adapter.on('data', (_settings, data) => received.push({...data}))
    sensor.on('data', adapter.onDeviceData.bind(adapter))
    expect(await sensor.subscribe()).toBe(true)
    const send = (hex:string) => characteristic.emit('data', Buffer.from(hex, 'hex'), true)
    return {sensor, characteristic, adapter, received, send, peripheral}
}

test('Garmin notifications pass through peripheral, sensor, parser and adapter', async () => {
    const {send, received} = await setup()
    send('020800a52b')
    expect(received.at(-1).cadence).toBeUndefined()
    send('0209001633')
    expect(received.at(-1).cadence).toBeCloseTo(32.3, 0)
    for (let i=0; i<5; i++) send('0209001633')
    expect(received.at(-1).cadence).toBe(0)
    send('020a003238')
    expect(received.at(-1).cadence).toBeCloseTo(47, 0)
})

test('rollover and disconnect baseline use real notification path', async () => {
    const {send, received, sensor} = await setup()
    send('02ffff00fe')
    send('0200000002')
    expect(received.at(-1).cadence).toBe(60)
    sensor.onDisconnect()
    send('020800a52b')
    expect(received.at(-1).cadence).toBeUndefined()
    send('0209001633')
    expect(received.at(-1).cadence).toBeCloseTo(32.3, 0)
})

test('Garmin cadence survives the real speed calculation mode and reconnect', async () => {
    const {send, received, sensor, adapter} = await setup(true)
    expect(adapter.getCyclingMode().getName()).toBe('SpeedSensor')
    send('020800a52b')
    expect(received.at(-1).cadence).toBeUndefined()
    send('0209001633')
    expect(Number.isFinite(received.at(-1).cadence)).toBe(true)
    expect(received.at(-1).cadence).toBeCloseTo(32.3, 0)
    send('0209001633')
    expect(received.at(-1).cadence).toBeCloseTo(32.3, 0)
    for (let i=0; i<4; i++) send('0209001633')
    expect(received.at(-1).cadence).toBe(0)
    sensor.onDisconnect()
    send('020800a52b')
    expect(received.at(-1).cadence).toBeUndefined()
    send('020a003238')
    expect(received.at(-1).cadence).toBeGreaterThan(0)
})

test('sensor reconnect resets its baseline and resumes delivery through the calculation mode', async () => {
    const {send, received, sensor, adapter, peripheral, characteristic} = await setup(true)
    send('020800a52b')
    send('0209001633')
    expect(received.at(-1).cadence).toBeCloseTo(32.3, 0)
    // A real peripheral disconnect removes characteristic listeners and subscriptions.
    characteristic.removeAllListeners('data')
    peripheral.subscribed = []
    expect(await sensor.reconnectSensor(false)).toBe(true)
    expect(adapter.getCyclingMode().getName()).toBe('SpeedSensor')
    send('020800a52b')
    expect(received.at(-1).cadence).toBeUndefined()
    send('0209001633')
    expect(received.at(-1).cadence).toBeCloseTo(32.3, 0)
})
