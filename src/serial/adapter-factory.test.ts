import { SerialPortProvider } from "../serial"
import { Daum8iMock, Daum8iMockImpl } from "./daum/premium/mock"
import {SerialAdapterFactory} from "./"

import DaumClassicAdapter from './daum/classic/adapter'
import DaumPremiumAdapter from './daum/premium/adapter';
import KettlerRacerAdapter  from './kettler/ergo-racer/adapter';

import { MockBinding } from "@serialport/binding-mock"
import { EventLogger } from "gd-eventlog"
import { KettlerRacerMock } from "./kettler/ergo-racer/mock"

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

describe('SerialAdapterFactory',()=>{

    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )

        Daum8iMockImpl.reset();        
        MockBinding.reset();

    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined as any)

    })

    describe('DaumPremium',()=>{

        let device

        beforeEach( ()=> {
            (SerialAdapterFactory as any)._instance = undefined
            SerialAdapterFactory.getInstance().registerAdapter( 'Daum Classic',DaumClassicAdapter)
            SerialAdapterFactory.getInstance().registerAdapter( 'Daum Premium',DaumPremiumAdapter)
            SerialAdapterFactory.getInstance().registerAdapter( 'Kettler Racer', KettlerRacerAdapter)

            SerialPortProvider.getInstance().setBinding('serial',Daum8iMock)
            
            MockBinding.createPort('COM5')
            device = null;
        })

        afterEach( async ()=>{
            if  (device)
                await device?.close()           
        })

        test('valid serial',async ()=>{
            const af = SerialAdapterFactory.getInstance()
            const settings = {
                name: "Daum8i",
                displayName: "Daum8i (192.168.2.115)",
                selected: false,
                protocol: "Daum Premium",
                interface: "serial",
                port: "COM5"
            }

            device = af.createInstance(settings)
            expect(device).toBeDefined()
            expect(device?.getName()).toBe('Daum8i')

            // we can connect to the device
            const available = await device.check()
            expect(available).toBeTruthy()

        })

        test('invalid serial',async ()=>{
            const af = SerialAdapterFactory.getInstance()
            const settings = {
                name: "Daum8i",
                displayName: "Daum8i (192.168.2.115)",
                selected: false,
                protocol: "Daum Premium",
                interface: "serial",
                port: "COM6"
            }

            device = af.createInstance(settings) 
            expect(device).toBeDefined()
            expect(device?.getName()).toBe('Daum8i')

            // we can connect to the device
            
            const available = await device.check()
            expect(available).toBeFalsy()

        })

    })


    describe('Kettler Racer',()=>{

        let device

        beforeEach( ()=> {
            (SerialAdapterFactory as any)._instance = undefined
            SerialAdapterFactory.getInstance().registerAdapter( 'Daum Classic',DaumClassicAdapter)
            SerialAdapterFactory.getInstance().registerAdapter( 'Daum Premium',DaumPremiumAdapter)
            SerialAdapterFactory.getInstance().registerAdapter( 'Kettler Racer', KettlerRacerAdapter)
            
            SerialPortProvider.getInstance().setBinding('serial',KettlerRacerMock)
            
            MockBinding.createPort('COM5')
            device = null;
        })

        afterEach( async ()=>{
            if  (device)
                await device?.close()           
        })

        test('valid serial',async ()=>{
            const af = SerialAdapterFactory.getInstance()
            const settings = {
                name: "Kettler Racer",
                selected: false,
                protocol: "Kettler Racer",
                interface: "serial",
                port: "COM5"
            }

            device = af.createInstance(settings) 


            expect(device).toBeDefined()
            expect(device).toBeInstanceOf(KettlerRacerAdapter)
            expect(device?.getName()).toBe('Kettler Racer')
            
            

            // we can connect to the device
            const available = await device.check()
            expect(available).toBeTruthy()

        })

        test('invalid serial',async ()=>{
            const af = SerialAdapterFactory.getInstance()
            const settings = {
                name: "Kettler Racer",
                selected: false,
                protocol: "Kettler Racer",
                interface: "serial",
                port: "COM6"
            }

            device = af.createInstance(settings) 
            expect(device).toBeDefined()
            expect(device?.getName()).toBe('Kettler Racer')

            // we can connect to the device
            
            const available = await device.check()
            expect(available).toBeFalsy()

        })

    })

    describe('Exceptions',()=>{
        test('unknown protocol',()=>{

        })

    })

})