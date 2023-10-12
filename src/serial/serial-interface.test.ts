import { autoDetect } from '@serialport/bindings-cpp'
import { MockBinding } from '@serialport/binding-mock'
import SerialInterface, { SerialInterfaceType } from './serial-interface'

import { TCPBinding } from './bindings/tcp'

import {SerialAdapterFactory,SerialIncyclistDevice} from '.'  // Import needs to be from here so that the adapters are registered

import CyclingMode from '../modes/types'
import { ControllableDevice } from '../base/adpater'
import { DeviceProperties } from '../types/device'

describe('SerialInterface',()=>{

    describe('connect',()=>{

        beforeEach( ()=>{
            SerialInterface._instances = []
            MockBinding.reset()
        })

        test('connect on MockBinding with ports',async ()=>{
            MockBinding.createPort('COM1')
            const serial = new SerialInterface({ifaceName:SerialInterfaceType.SERIAL,binding:MockBinding})

            const connected = await serial.connect()
            expect(connected).toBeTruthy()

        })

        test('connect on MockBinding without ports',async ()=>{
            const serial = new SerialInterface({ifaceName:SerialInterfaceType.SERIAL,binding:MockBinding})

            const connected = await serial.connect()
            expect(connected).toBeTruthy()
          
        })

        test('connect attempt with CppBindig',async ()=>{
            const serial = new SerialInterface({ifaceName:SerialInterfaceType.SERIAL,binding:autoDetect()})

            const connected = await serial.connect()
            expect(connected).toBeTruthy()
            
        })

        test('connect attempt with TcpBindiing',async ()=>{
            const serial = new SerialInterface({ifaceName:SerialInterfaceType.TCPIP,binding:TCPBinding})

            const connected = await serial.connect()
            expect(connected).toBeTruthy()
            
        })

        test('connect on missing binding',async ()=>{
            
            const serial = new SerialInterface({ifaceName:SerialInterfaceType.SERIAL})

            const connected = await serial.connect()
            expect(connected).toBeFalsy()

        })

    })


    describe('openPort',()=>{

        beforeEach( ()=>{
            SerialInterface._instances = []
            MockBinding.reset()
        })


        test('existing port',async ()=>{
            MockBinding.createPort('COM1')
            const serial = new SerialInterface({ifaceName:SerialInterfaceType.SERIAL,binding:MockBinding})

            const connected = await serial.openPort('COM1')
            expect(connected).toBeTruthy()
            expect(serial.ports.length).toBe(1)

            const port = serial.ports[0].port
            expect(port.isOpen).toBeTruthy()
        })

        test('port does not exist',async ()=>{
            MockBinding.createPort('COM1')
            const serial = new SerialInterface({ifaceName:SerialInterfaceType.SERIAL,binding:MockBinding})

            const connected = await serial.openPort('COM5')
            expect(connected).toBeFalsy()
            expect(serial.ports.length).toBe(0)
        })

    })

    describe('scan',()=>{


        beforeEach( ()=>{
            SerialInterface._instances = []
            MockBinding.reset()

        })

        test('single port serial, device found',async ()=>{
            MockBinding.createPort('COM1')
            const serial = new SerialInterface({ifaceName:SerialInterfaceType.SERIAL,binding:MockBinding})


            class MockAdapter extends SerialIncyclistDevice<ControllableDevice<DeviceProperties>,DeviceProperties> {
                async check(): Promise<boolean> {
                    return true
                }
                getSupportedCyclingModes() { return []}
                getDefaultCyclingMode() { return {} as CyclingMode}
                async stop():Promise<boolean> { return true}
                async close():Promise<boolean> { return true}
  
            }
            
            const adapter = new MockAdapter({protocol:'Daum Classic', port:'COM1', interface:'serial'})           
            SerialAdapterFactory.getInstance().createInstance = jest.fn( ()=>adapter)                    
            
            
            const detected = await serial.scan({timeout:100, protocol:'Daum Classic' })
            expect(detected.length).toBe(1)
            expect(detected[0]).toMatchObject( { interface:'serial',protocol: 'Daum Classic', port:'COM1'})
            
        })

        test('single port tcpip, device found',async ()=>{
            MockBinding.createPort('127.0.0.1:1234')
            const serial = new SerialInterface({ifaceName:SerialInterfaceType.TCPIP,binding:MockBinding})



            class MockAdapter extends SerialIncyclistDevice<ControllableDevice<DeviceProperties>,DeviceProperties> {
                async check(): Promise<boolean> {
                    return true
                }
                async stop():Promise<boolean> { return true}
                async close():Promise<boolean> { return true}
                getSupportedCyclingModes() { return []}
                getDefaultCyclingMode() { return {} as CyclingMode}
    
            }
            
            const adapter = new MockAdapter({protocol:'Daum Premium', host:'127.0.0.1', port:'1234', interface:'tcpip'})           
            SerialAdapterFactory.getInstance().createInstance = jest.fn( ()=>adapter)                    
            
            
            const detected = await serial.scan({timeout:100, port:'1234',protocol:'Daum Premium' })
            expect(detected.length).toBe(1)

            
        })

        test('no ports ',async ()=>{
            jest.useRealTimers()          
            const serial = new SerialInterface({ifaceName:SerialInterfaceType.SERIAL,binding:MockBinding})
    
            const detected = await serial.scan({timeout:100, protocol:'Daum Classic' })
            expect(detected.length).toBe(0)

            
        })

    })
})