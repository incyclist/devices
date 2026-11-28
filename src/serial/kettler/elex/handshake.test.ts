import { EventLogger } from 'gd-eventlog'
import { MockBinding } from '@serialport/binding-mock'
import KettlerSerialComms from '../comms'
import { Command } from '../types'
import { SerialPortProvider } from '../..'
import { KettlerRacerMock, KettlerRacerMockImpl, KettlerRacerSimulator } from '../ergo-racer/mock'
import { isValidIdentifier } from './handshake'
import { useFeatureToggle } from '../../../features'

if (process.env.DEBUG === undefined)
    console.log = jest.fn();

const handshakeTimeouts = { flush: 10, textProbe: 200, frame: 200, text: 200 }

describe('Elex handshake', () => {

    describe('isValidIdentifier', () => {
        test.each([
            ['EA10S1801', true],
            ['SDFB3129', true],
            ['ERROR', false],
            ['EERROR', false],
            ['1801', false],
            ['EA10S\tRACER S', false],
            ['ACK', false],
            ['', false],
            [undefined, false],
        ])('%j -> %s', (id, expected) => {
            expect(isValidIdentifier(id)).toBe(expected)
        })
    })

    describe('prepareConnection', () => {
        let comms: KettlerSerialComms<Command>

        beforeAll(() => {
            useFeatureToggle().add('KettlerRacerBluetooth')
        })

        afterAll(() => {
            useFeatureToggle().remove('KettlerRacerBluetooth')
        })

        beforeEach(() => {
            KettlerRacerMockImpl.reset()
            SerialPortProvider.getInstance().setBinding('serial', KettlerRacerMock)
            MockBinding.reset()
            MockBinding.createPort('COM1')
        })

        afterEach(async () => {
            if (comms?.getSerialInterface())
                await comms.getSerialInterface().closePort(comms.getPort())
        })

        const open = async (simulator?: KettlerRacerSimulator) => {
            if (simulator)
                KettlerRacerMockImpl.getInstance().setSimulator('COM1', simulator)
            comms = new KettlerSerialComms<Command>({ interface: 'serial', port: 'COM1', logger: new EventLogger('Test'), settings: { handshakeTimeouts } })
            return await comms.open()
        }

        test('classic bike answers in text: no handshake', async () => {
            expect(await open()).toBe(true)
            expect(comms.getHandshakeResult()).toEqual({ mode: 'text', id: 'SDFB3129' })
            expect(comms.isElexDevice()).toBe(false)
        })

        test('Racer S in binary mode: Elex handshake, first ERROR after switching is skipped', async () => {
            expect(await open(KettlerRacerSimulator.createElex())).toBe(true)
            expect(comms.getHandshakeResult()).toEqual({ mode: 'elex', elexId: 'EA10S1201', firmware: 4609, id: 'EA10S1801' })
            expect(comms.isElexDevice()).toBe(true)
        })

        test('Racer S still in text mode from a previous session (iOS): leftover ERROR is skipped', async () => {
            const simulator = KettlerRacerSimulator.createElex()
            simulator.textMode = true
            simulator.errorOnNextText = true

            expect(await open(simulator)).toBe(true)
            expect(comms.getHandshakeResult()).toEqual({ mode: 'text', id: 'EA10S1801' })
        })

        test('no answer at all: open still succeeds (as before the handshake was introduced)', async () => {
            // plain mock port that never answers
            SerialPortProvider.getInstance().setBinding('serial', MockBinding)

            expect(await open()).toBe(true)
            expect(comms.getHandshakeResult()).toEqual({ mode: 'none' })
            expect(comms.isElexDevice()).toBe(false)
        })
    })
})
