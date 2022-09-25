import BleInterface from './ble-interface'
import {MockLogger} from '../../test/logger'
import WahooAdvancedFitnessMachineDevice from './wahoo-kickr'
import { BleCharacteristic, BlePeripheral } from './ble'
import { CSP, CSP_MEASUREMENT, FTMS, FTMS_CP, WAHOO_ADVANCED_TRAINER_CP } from './consts'
import CSPDevice from './pwr'
import FTMSDevice from './fm'

describe('BleInterface',()=>{

    describe('getDevicesFromServices',()=>{

        describe('Wahoo SmartTrainer',()=>{

            test('full uuid - capital',()=>{
                const ble = new BleInterface( {logger:MockLogger})
                const res = ble.getDevicesFromServices([CSPDevice,FTMSDevice, WahooAdvancedFitnessMachineDevice],[CSP])
                expect(res).toEqual([CSPDevice,WahooAdvancedFitnessMachineDevice])
            })

        })


    })

    describe('createDevice',()=>{
        describe('Wahoo SmartTrainer',()=>{

            const checkCreateDevice = (uuidTest,ftms:boolean=false) => {
                const ble = new BleInterface( {logger:MockLogger})

                const power = {uuid:CSP_MEASUREMENT} as unknown as BleCharacteristic
                const wahooExt = {uuid:uuidTest} as unknown as BleCharacteristic
                const ftmsCp = {uuid:FTMS_CP}as unknown as BleCharacteristic
                const peripheral =  ftms ? 
                    {services:[CSP,FTMS],advertisement:{localName:'test',serviceUuids:[CSP,FTMS]}} as unknown as BlePeripheral : 
                    {services:[CSP],advertisement:{localName:'test',serviceUuids:[CSP]}} as unknown as BlePeripheral
                const characteristics = ftms ? 
                    [power,wahooExt,ftmsCp]: 
                    [power,wahooExt]
                return ble.createDevice(WahooAdvancedFitnessMachineDevice, peripheral, characteristics)
            }

            test('full uuid - capital',()=>{
                const res = checkCreateDevice('A026E005-0A7D-4AB3-97FA-F1500F9FEB8B')                
                expect(res).toBeInstanceOf(WahooAdvancedFitnessMachineDevice)

                const device = res as WahooAdvancedFitnessMachineDevice
                expect(device.wahooCP).toBe('A026E005-0A7D-4AB3-97FA-F1500F9FEB8B')
            })

            test('nobe-winrt uuid - lowercase, no dashes',()=>{
                const res = checkCreateDevice('a026e0050a7d4ab397faf1500f9feb8b')                
                expect(res).toBeInstanceOf(WahooAdvancedFitnessMachineDevice)

                const device = res as WahooAdvancedFitnessMachineDevice
                expect(device.wahooCP).toBe('a026e0050a7d4ab397faf1500f9feb8b')
            })

            test('shortened uuid - uppercase',()=>{
                const res = checkCreateDevice('A026E005')                
                expect(res).toBeInstanceOf(WahooAdvancedFitnessMachineDevice)

                const device = res as WahooAdvancedFitnessMachineDevice
                expect(device.wahooCP).toBe('A026E005')
            })

            test('shortened uuid - lowercase',()=>{
                const res = checkCreateDevice('a026e005')                
                expect(res).toBeInstanceOf(WahooAdvancedFitnessMachineDevice)

                const device = res as WahooAdvancedFitnessMachineDevice
                expect(device.wahooCP).toBe('a026e005')
            })

            test('device also supports ftms',()=>{
                const res = checkCreateDevice('a026e005',true)                
                expect(res).toBeUndefined()
            })


        })

    })

})