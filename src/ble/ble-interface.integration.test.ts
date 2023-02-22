import {BleInterface} from '../ble'
import {MockLogger} from '../../test/logger'
import { CSP } from './consts'
import { BlePwrComms as CSPDevice} from './cp'
import { BleFmComms as FTMSDevice} from './fm'
import { BleWahooComms as WahooAdvancedFitnessMachineDevice} from './wahoo'
import { BleTacxComms as TacxAdvancedFitnessMachineDevice} from './tacx'
import { getBestDeviceMatch, getDevicesFromServices } from './base/comms-utils'
import { MockBinding } from './bindings'
import { HrMock } from './hr/mock'
import { BleComms } from './base/comms'


describe('BleInterface',()=>{

    describe('scan',()=> {
        test('scan',async ()=> {

            MockBinding.addMock(HrMock)

            const ble = new BleInterface({logger:MockLogger,binding:MockBinding})
            await ble.connect()
            const devices = await ble.scan({timeout:1000})
            expect(devices.length).toBe(1)
            expect(devices[0]).toMatchObject({name:'HRM-Mock'})
        })

    })
    describe('getDevicesFromServices',()=>{

        describe('Wahoo SmartTrainer',()=>{

            test('full uuid - capital',()=>{
                const ble = new BleInterface( {logger:MockLogger})
                const res = getDevicesFromServices([CSPDevice,FTMSDevice, WahooAdvancedFitnessMachineDevice],[CSP])
                expect(res).toEqual([CSPDevice,WahooAdvancedFitnessMachineDevice])
            })

        })


    })


    describe('getBestDeviceMatch',()=> {

        test('Power and wahoo',()=>{
            const classes = [ CSPDevice, WahooAdvancedFitnessMachineDevice];
            const peripheral = {
                id:'123',
                advertisement: {
                    localName: 'test'
                }
            }
            const ble = new BleInterface( {logger:MockLogger})
            const C = getBestDeviceMatch(classes) as any;
            const device = new C({peripheral})
            expect( device ).toBeInstanceOf( WahooAdvancedFitnessMachineDevice)
        })

        test('Power,Wahoo and FTMS',()=>{
            const classes = [ CSPDevice, WahooAdvancedFitnessMachineDevice, FTMSDevice];
            const peripheral = {
                id:'123',
                advertisement: {
                    localName: 'test'
                }
            }
            const ble = new BleInterface( {logger:MockLogger})
            const C = getBestDeviceMatch(classes) as any;
            const device = new C({peripheral})
            expect( device ).toBeInstanceOf( FTMSDevice)
        })

        test('Power and Tacx',()=>{
            const classes = [ CSPDevice, TacxAdvancedFitnessMachineDevice];
            const peripheral = {
                id:'123',
                advertisement: {
                    localName: 'test'
                }
            }
            const ble = new BleInterface( {logger:MockLogger})
            const C = getBestDeviceMatch(classes) as any;
            const device = new C({peripheral})
            expect( device ).toBeInstanceOf( TacxAdvancedFitnessMachineDevice)
        })

        test('Power, Tacx and FTMS',()=>{
            const classes = [ CSPDevice, TacxAdvancedFitnessMachineDevice, FTMSDevice];
            const peripheral = {
                id:'123',
                advertisement: {
                    localName: 'test'
                }
            }
            const ble = new BleInterface( {logger:MockLogger})
            const C = getBestDeviceMatch(classes) as any;
            const device = new C({peripheral})
            expect( device ).toBeInstanceOf( FTMSDevice)
        })


    })

})