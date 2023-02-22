import BleInterface from './ble-interface'
import {MockLogger} from '../../test/logger'
import { CSP } from './consts'
import { BlePwrComms as CSPDevice} from './cp'
import { BleFmComms as FTMSDevice} from './fm'
import { BleWahooComms as WahooAdvancedFitnessMachineDevice} from './wahoo'
import { BleTacxComms as TacxAdvancedFitnessMachineDevice} from './tacx'
import { getBestDeviceMatch, getDevicesFromServices } from './base/comms-utils'


describe('BleInterface',()=>{

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