import { EventLogger } from "gd-eventlog"
import { BleInterface } from "./interface"
import { BleBinding,  BleInterfaceState, BlePeripheralAnnouncement, BlePeripheralInfo } from "../types"

import { resolveNextTick } from "../../utils/utils"
import EventEmitter from "events"


const FTMSPeripheral: BlePeripheralInfo = {
    id: "c08248a35c70",
    uuid: "",
    address: "cb:ae:55:05:bc:99",
    addressType: "",
    advertisement: {localName: "Volt", serviceUuids: ['00001826-0000-1000-8000-00805f9b34fb','00001816-0000-1000-8000-00805f9b34fb','00001818-0000-1000-8000-00805f9b34fb','0000180a-0000-1000-8000-00805f9b34fb']},
    rssi: -67,
    serviceUUIDs: ['00001826-0000-1000-8000-00805f9b34fb','00001816-0000-1000-8000-00805f9b34fb','00001818-0000-1000-8000-00805f9b34fb','0000180a-0000-1000-8000-00805f9b34fb'],
    stats: ""
}

const WahooPeripheral: BlePeripheralInfo = {
    id: "c08248a35c70",
    uuid: "",
    address: "cb:ae:55:05:bc:99",
    addressType: "",
    advertisement: {localName: "KICKR SNAP 8616", serviceUuids: ['00001818-0000-1000-8000-00805f9b34fb']},
    rssi: -67,
    serviceUUIDs: ['00001818-0000-1000-8000-00805f9b34fb'],
    stats: ""
}

class MockBinding extends EventEmitter implements BleBinding {
    public state
    public _bindings: any
    constructor() {
        super()
        this.state = undefined
        
    }
    startScanning(serviceUUIDs?: string[], allowDuplicates?: boolean, callback?: (error?: Error) => void): void {
        throw new Error("Method not implemented.")
    }
    stopScanning(callback?: () => void): void {
        throw new Error("Method not implemented.")
    }
    pauseLogging() {
        throw new Error("Method not implemented.")
    }
    resumeLogging() {
        throw new Error("Method not implemented.")
    }
    setServerDebug(enabled: boolean) {
        throw new Error("Method not implemented.")
    }
}

describe('BleInterface', () => {   

    describe('connect', () => {

        interface Mocks {
            binding?:Partial<BleBinding>
            startPeripheralScan?:jest.Mock
        }

        let i:BleInterface
        const logger:Partial<EventLogger>= {logEvent:jest.fn()} 
        let mocks:Mocks        

        const setupMocks  = ( iface, props:{ binding?:boolean, connectState?:BleInterfaceState|(()=>BleInterfaceState), expected?:string[]} ) =>{
            const {binding=true, connectState,expected=['0x1818','0x1826']} = props??{}
            mocks = {}
            
            if (binding) {
                const b = new MockBinding()
                mocks.binding = b  
                mocks.binding.startScanning = jest.fn()
                mocks.binding.stopScanning = jest.fn()
                mocks.binding.pauseLogging = jest.fn()
                mocks.binding.resumeLogging = jest.fn()
                if (typeof connectState === 'function') {
                    resolveNextTick().then(()=>{
                        const state = connectState();
                        b.state = state
                        b.emit('stateChange', state)
                    })
                }
                else {
                    mocks.binding.state = connectState
                }                
            }
            iface.getBinding = jest.fn().mockReturnValue(mocks.binding)
            iface.getConnectTimeout = jest.fn().mockReturnValue(100)
            mocks.startPeripheralScan = iface.startPeripheralScan = jest.fn()
            iface.getAdapterFactory = jest.fn().mockReturnValue({ getAllSupportedServices:jest.fn().mockReturnValue(expected)})
        }
        const cleanupMocks = () => {
            if (mocks.binding) {
                const b:BleBinding = mocks.binding as BleBinding
                b.removeAllListeners()
            }
        }

        beforeEach(() => {
            BleInterface.prototype['autoConnect'] = jest.fn()
            i = BleInterface.getInstance({logger: logger as EventLogger})
        })
        afterEach(() => {
            // cleanup instance
            (BleInterface as any)._instance = undefined

            cleanupMocks()
        })



        test('successfull connect', async () => {
            setupMocks(i, {binding: true, connectState: ()=>'poweredOn'})

            const res = await i.connect()
            expect(res).toBeTruthy()
            expect(i.isConnected()).toBeTruthy()

            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connect request'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connected'})
            expect(mocks.startPeripheralScan).toHaveBeenCalledTimes(1)

        })
        test('no binding', async () => {
            setupMocks(i, {binding: false})

            const res = await i.connect()
            expect(res).toBeFalsy()
            expect(i.isConnected()).toBeFalsy()
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE not available'})

        })
        test('connect failure', async () => {
            setupMocks(i, {binding: true, connectState: ()=>'unauthorized'})

            const res = await i.connect()
            expect(res).toBeFalsy()
            expect(i.isConnected()).toBeFalsy()
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connect request'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE state change', state:'unauthorized'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connect timeout', active:true})
        })
        test('already connecting', async () => {
            setupMocks(i, {binding: true, connectState: ()=>'unauthorized'})

            i.connect()
            const res = await i.connect()
            expect(res).toBeFalsy()
            expect(i.isConnected()).toBeFalsy()
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connect request'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connect - already connecting'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE state change', state:'unauthorized'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connect timeout', active:true})

        })

        test('interface already connected ', async () => {
            setupMocks(i, {binding: true, connectState:'poweredOn'})

            const res = await i.connect()
            expect(res).toBeTruthy()
            expect(i.isConnected()).toBeTruthy()
            expect(mocks.startPeripheralScan).toHaveBeenCalledTimes(1)

            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connect request'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connected'})

        })
        test('already connected - connect called twice', async () => {
            setupMocks(i, {binding: true, connectState:'poweredOn'})

            await i.connect()
            jest.clearAllMocks()

            const res = await i.connect()
            expect(res).toBeTruthy()
            expect(i.isConnected()).toBeTruthy()
            expect(mocks.startPeripheralScan).not.toHaveBeenCalled()
            expect(logger.logEvent).not.toHaveBeenCalled()
            

        })

        

    })
    describe('disconnect', () => {})

    describe('internal peripheral scan', () => {

        interface Mocks {
            binding?:Partial<BleBinding>
            discoverServices?
        }

        let i:BleInterface
        const logger:Partial<EventLogger>= {logEvent:jest.fn()} 
        let mocks:Mocks      
        let iv  

        const setupMocks  = ( iface, props:{ connected?:boolean, expected?:string[], peripheral?:BlePeripheralInfo,protocol?:string}={},  ) =>{
            const {connected=true, expected=['0x1818','0x1826'],peripheral,protocol='fm'} = props??{}
            mocks = {}
           
            
            const ble = mocks.binding = new MockBinding()
            mocks.binding.startScanning = jest.fn( (_s,_allowDuplicates,cb)=>{
                if (peripheral) {
                    iv = setInterval( () => {
                        ble.emit('discover',peripheral)
                    },10)
                }    
                if (cb)
                    cb()
            })
            mocks.binding.stopScanning = jest.fn( (cb)=>{
                clearInterval(iv)
                iv = undefined
                if (cb)
                    cb()
            })
            mocks.binding.pauseLogging = jest.fn()
            mocks.binding.resumeLogging = jest.fn()
            mocks.binding.state = connected ? 'poweredOn' : 'poweredOff'

                            
            iface.getBinding = jest.fn().mockReturnValue(mocks.binding)
            iface.getConnectTimeout = jest.fn().mockReturnValue(100)
            iface.getAdapterFactory = jest.fn().mockReturnValue(
                { 
                    getAllSupportedServices:jest.fn().mockReturnValue(expected),
                    getProtocol:jest.fn().mockReturnValue(protocol)

                })
            iface.discoverServices = mocks.discoverServices = jest.fn()
        }
        const cleanupMocks = () => {
            if (mocks.binding) {
                const b:BleBinding = mocks.binding as BleBinding
                b.removeAllListeners()
            }
        }

        beforeEach(() => {
            BleInterface.prototype['autoConnect'] = jest.fn()
            i = BleInterface.getInstance({logger: logger as EventLogger})
        })
        afterEach(() => {

            i.disconnect(); 

            // cleanup instance
            (BleInterface as any)._instance = undefined

            cleanupMocks()
            if (iv) clearInterval(iv)
        })

        test('no device announced', async () => {
            setupMocks(i)

            const device = await new Promise( resolve => {                
                i.on('device',resolve)
                i.connect()
                //jest.clearAllMocks()

                setTimeout(()=>{ 
                    i.disconnect(); 
                    resolve(undefined)
                },10)
            })

            expect(device).toBeUndefined()
            expect(logger.logEvent).toHaveBeenCalledWith({message:'starting peripheral discovery ...'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'stopping peripheral discovery ...'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'disconnect request'})
        })

        test('FTMS announced', async () => {
            setupMocks(i,{peripheral:FTMSPeripheral})

            const device = await new Promise( resolve => {                
                i.on('device',resolve)
                i.connect()
                //jest.clearAllMocks()

                setTimeout(()=>{ 
                    resolve(undefined)
                },1000)
            })

            expect(device).toMatchObject({interface:'ble',protocol:'fm',id:'c08248a35c70',name:'Volt',address:'cb:ae:55:05:bc:99' })
            expect(logger.logEvent).toHaveBeenCalledWith({message:'starting peripheral discovery ...'})
        })
        test('Wahoo device announced', async () => {
            setupMocks(i,{peripheral:WahooPeripheral, protocol:'wahoo'})
            mocks.discoverServices.mockResolvedValue(['0x1818','a026ee0b-0a7d-4ab3-97fa-f1500f9feb8b'])

            const device = await new Promise( resolve => {                
                i.on('device',resolve)
                i.connect()
                //jest.clearAllMocks()

                setTimeout(()=>{ 
                    resolve(undefined)
                },1000)
            })

            expect(device).toMatchObject({interface:'ble',protocol:'wahoo',id:'c08248a35c70',name:'KICKR SNAP 8616',address:'cb:ae:55:05:bc:99' })
            expect(mocks.discoverServices).toHaveBeenCalled()
            expect(logger.logEvent).toHaveBeenCalledWith({message:'starting peripheral discovery ...'})
        })
        
        

    })

    // check also isConnected, getName, setBinding


    describe('scan', () => {})
    describe('stopScan', () => {})

    describe('createPeripheral', () => {})
    describe('createPeripheralFromSettings', () => {})
    describe('createDeviceSetting', () => {})
    describe('waitForPeripheral', () => {})


} )