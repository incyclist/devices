import { BleCyclingSpeedCadenceDevice } from './sensor.js'

const M = (str) => Buffer.from(str,'hex')

describe('BleCyclingSpeedCadenceDevice',()=>{

    describe('onDisconnect',()=>{

        // production log 2026-08-20: a BLE reconnect reset the sensor's onboard wheel-revolution
        // counter to 0. The parser was still holding its pre-disconnect baseline, diffed against it,
        // and emitted a negative speed - which onData() then had to detect and drop.
        test('clears the CSC measurement baseline so a post-reconnect notification is not diffed against stale pre-disconnect state',()=>{
            const sensor:any = new BleCyclingSpeedCadenceDevice(null)
            sensor.logEvent = jest.fn()
            const onData = jest.fn()
            sensor.on('data', onData)

            // establish a baseline, then a repeat (no motion) - matches the production trace
            sensor.onData('2a5b', M('016b0d0000e282'))
            sensor.onData('2a5b', M('016b0d0000e282'))

            // simulate the BLE reconnect
            sensor.onDisconnect()

            // first notification after reconnect: sensor's onboard counters reset to 0
            const result = sensor.onData('2a5b', M('01000000000000'))

            expect(result).toBe(true)
            expect(sensor.logEvent).not.toHaveBeenCalledWith(expect.objectContaining({error:'speed<0'}))
            expect(onData).toHaveBeenCalled()
            const lastData = onData.mock.calls.at(-1)[0]
            expect(lastData.speed===undefined || lastData.speed>=0).toBe(true)
        })

    })

})
