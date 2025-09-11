import { EventLogger } from "gd-eventlog"
import { BleInterface } from "./interface"
import { BleBinding,  BleInterfaceState, BlePeripheralAnnouncement, BlePeripheralInfo, BleRawPeripheral } from "../types"

import { resolveNextTick } from "../../utils/utils"
import EventEmitter from "events"
import { beautifyUUID } from "../utils"

const logger:Partial<EventLogger>= {logEvent:jest.fn(),getName:()=>'Ble'} 

const FTMSPeripheral: Partial<BleRawPeripheral> = {
    id: "c08248a35c70",
    address: "cb:ae:55:05:bc:99",
    advertisement: {localName: "Volt", serviceUuids: ['00001826-0000-1000-8000-00805f9b34fb','00001816-0000-1000-8000-00805f9b34fb','00001818-0000-1000-8000-00805f9b34fb','0000180a-0000-1000-8000-00805f9b34fb']},
}

const WahooPeripheral: Partial<BleRawPeripheral> = { ...FTMSPeripheral,
    advertisement: {localName: "KICKR SNAP 8616", serviceUuids: ['00001818-0000-1000-8000-00805f9b34fb']},
}

const CPPeripheral: Partial<BleRawPeripheral> = { ...FTMSPeripheral,
    advertisement: {localName: "Favero", serviceUuids: ['00001818-0000-1000-8000-00805f9b34fb']},
}

const HRPeripheral: Partial<BleRawPeripheral>  = { ...FTMSPeripheral,
    advertisement: {localName: "HR", serviceUuids: ['0000180D-0000-1000-8000-00805f9b34fb']},
}
const TacxPeripheral: Partial<BleRawPeripheral>  = { ...FTMSPeripheral,
    advertisement: {localName: "Tacx", serviceUuids: ['00001818-0000-1000-8000-00805f9b34fb','6E40FEC1-B5A3-F393-E0A9-E50E24DCCA9E']},
}
const NoNamePeripheral: Partial<BleRawPeripheral>  = { ...FTMSPeripheral,
    advertisement: { serviceUuids: ['00001818-0000-1000-8000-00805f9b34fb']},
}
const NoServicesPeripheral: Partial<BleRawPeripheral>  = { ...FTMSPeripheral,
    advertisement: { localName:'Test', serviceUuids: []},
}
const UnsupportedPeripheral: Partial<BleRawPeripheral>  = { ...FTMSPeripheral,
    advertisement: { localName:'Test', serviceUuids: ['1234']},
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

        let i
        const logger:Partial<EventLogger>= {logEvent:jest.fn(), getName:()=>'Ble'} 
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
        afterEach(async () => {
            // cleanup instance
            (BleInterface as any)._instance = undefined

            cleanupMocks()

            await i.reset()
        })



        test('successfull connect', async () => {
            setupMocks(i, {binding: true, connectState: ()=>'poweredOn'})

            const res = await i.connect()
            expect(res).toBeTruthy()
            expect(i.isConnected()).toBeTruthy()

            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connect request',interface:'ble'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connected',interface:'ble'})
            expect(mocks.startPeripheralScan).toHaveBeenCalledTimes(1)

        })
        test('no binding', async () => {
            setupMocks(i, {binding: false})

            const res = await i.connect()
            expect(res).toBeFalsy()
            expect(i.isConnected()).toBeFalsy()
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE not available',interface:'ble'})

        })
        test('connect failure', async () => {
            setupMocks(i, {binding: true, connectState: ()=>'unauthorized'})

            const res = await i.connect()
            expect(res).toBeFalsy()
            expect(i.isConnected()).toBeFalsy()
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connect request',interface:'ble'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE state change', state:'unauthorized',interface:'ble'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connect timeout', active:true,interface:'ble'})
        })
        test('already connecting', async () => {
            setupMocks(i, {binding: true, connectState: ()=>'unauthorized'})

            i.connect()
            const res = await i.connect()
            expect(res).toBeFalsy()
            expect(i.isConnected()).toBeFalsy()
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connect request',interface:'ble'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connect - already connecting',interface:'ble'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE state change', state:'unauthorized',interface:'ble'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connect timeout', active:true,interface:'ble'})

        })

        test('interface already connected ', async () => {
            setupMocks(i, {binding: true, connectState:'poweredOn'})

            const res = await i.connect()
            expect(res).toBeTruthy()
            expect(i.isConnected()).toBeTruthy()
            expect(mocks.startPeripheralScan).toHaveBeenCalledTimes(1)

            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connect request',interface:'ble'})
            expect(logger.logEvent).toHaveBeenCalledWith({message:'BLE connected',interface:'ble'})

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
            processWahooAnnouncement?
            addService?
        }

        let i
        let mocks:Mocks      
        let iv  
        let to 
        

        const setupMocks  = ( iface, props:{ connected?:boolean, expected?:string[], peripheral?:Partial<BleRawPeripheral> ,protocol?:string}={},  ) =>{
            const {connected=true, expected=['0x1818','0x1826','0x180D','6E40FEC1-B5A3-F393-E0A9-E50E24DCCA9E'],peripheral,protocol='fm'} = props??{}
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
            mocks.processWahooAnnouncement = jest.spyOn(iface,'processWahooAnnouncement')
            mocks.addService = jest.spyOn(iface,'addService')
                            
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
            jest.resetAllMocks()
        }

        const waitForDevice = (timeout?:number,cnt?:number):Promise<{device:BleRawPeripheral,service:BlePeripheralAnnouncement}|undefined>=>{
            let cntFound = 0;
            return new Promise( resolve => {  
                if ((cnt??1)>1) {
                    i.on('device',(device,service)=>{
                        cntFound++
                        if (cntFound>=(cnt??1)) {
                            resolve({device,service})
                            if (to)
                                clearTimeout(to)
                        }
                            
                    })
                }
                else {
                    i.on('device',(device,service)=>{
                        resolve({device,service})
                        if (to)
                            clearTimeout(to)

                    })
                }
                
                i.connect()

                to = setTimeout(()=>{ 
                    resolve(undefined)

                },timeout??1000)
            })            
        }

        beforeEach(() => {
            BleInterface.prototype['autoConnect'] = jest.fn()
            i = BleInterface.getInstance({logger: logger as EventLogger})
        })
        afterEach(async () => {

            await i.disconnect(); 

            // cleanup instance
            (BleInterface as any)._instance = undefined

            cleanupMocks()
            if (iv) clearInterval(iv)
            if (to) clearTimeout(to)

            await i.reset()

        })

        test('no device announced', async () => {
            setupMocks(i)

            const res = await waitForDevice(10)

            expect(res).toBeUndefined()
            expect(logger.logEvent).toHaveBeenCalledWith({message:'starting peripheral discovery ...',interface:'ble'})
        })

        test('FTMS announced', async () => {
            setupMocks(i,{peripheral:FTMSPeripheral})
            const {device} = await waitForDevice()??{}

            expect(device).toMatchObject({interface:'ble',protocol:'fm',id:'c08248a35c70',name:'Volt',address:'cb:ae:55:05:bc:99' })
            expect(logger.logEvent).toHaveBeenCalledWith({message:'starting peripheral discovery ...',interface:'ble'})
            expect(mocks.addService).toHaveBeenCalledTimes(1)
        })

        test('Device only announced once', async () => {
            setupMocks(i,{peripheral:FTMSPeripheral})

            await waitForDevice(50,3)
            expect(mocks.addService).toHaveBeenCalledTimes(1)
            
        })

        test('Wahoo device announced', async () => {
            setupMocks(i,{peripheral:WahooPeripheral, protocol:'wahoo'})
            mocks.discoverServices.mockResolvedValue(['0x1818','a026ee0b-0a7d-4ab3-97fa-f1500f9feb8b'])

            const {device,service} = await waitForDevice()??{}

            expect(service?.serviceUUIDs.map( s => beautifyUUID(s) )).toEqual(['1818','A026EE0B-0A7D-4AB3-97FA-F1500F9FEB8B'])

            expect(device).toMatchObject({interface:'ble',protocol:'wahoo',id:'c08248a35c70',name:'KICKR SNAP 8616',address:'cb:ae:55:05:bc:99' })
            expect(mocks.discoverServices).toHaveBeenCalled()
            expect(mocks.processWahooAnnouncement).toHaveBeenCalled()
            expect(logger.logEvent).toHaveBeenCalledWith({message:'starting peripheral discovery ...',interface:'ble'})
        })
        
        test('CP device announced', async () => {
            setupMocks(i,{peripheral:CPPeripheral, protocol:'cp'})

            const {device} = await waitForDevice()??{}

            expect(device).toMatchObject({interface:'ble',protocol:'cp',id:'c08248a35c70',name:'Favero',address:'cb:ae:55:05:bc:99' })
            expect(mocks.discoverServices).not.toHaveBeenCalled()
            expect(mocks.processWahooAnnouncement).not.toHaveBeenCalled()
            expect(logger.logEvent).toHaveBeenCalledWith({message:'starting peripheral discovery ...',interface:'ble'})
        })

        test('TACX device announced', async () => {
            setupMocks(i,{peripheral:TacxPeripheral, protocol:'tacx'})

            const {device} = await waitForDevice()??{}

            expect(device).toMatchObject({interface:'ble',protocol:'tacx',id:'c08248a35c70',name:'Tacx',address:'cb:ae:55:05:bc:99' })
            expect(mocks.discoverServices).not.toHaveBeenCalled()
            expect(mocks.processWahooAnnouncement).not.toHaveBeenCalled()
            expect(logger.logEvent).toHaveBeenCalledWith({message:'starting peripheral discovery ...',interface:'ble'})
        })

        test('HR device announced', async () => {
            setupMocks(i,{peripheral:HRPeripheral, protocol:'hr'})

            const {device} = await waitForDevice()??{}

            expect(device).toMatchObject({interface:'ble',protocol:'hr',id:'c08248a35c70',name:'HR',address:'cb:ae:55:05:bc:99' })
            expect(mocks.discoverServices).not.toHaveBeenCalled()
            expect(mocks.processWahooAnnouncement).not.toHaveBeenCalled()
            expect(logger.logEvent).toHaveBeenCalledWith({message:'starting peripheral discovery ...',interface:'ble'})
        })
        test('announced with no name', async () => {
            setupMocks(i,{peripheral:NoNamePeripheral})

            const {device} = await waitForDevice(50)??{}
            expect(device).toBeUndefined()

            expect(logger.logEvent).toHaveBeenCalledWith({message:'starting peripheral discovery ...',interface:'ble'})
        })
        test('announced with no services', async () => {
            setupMocks(i,{peripheral:NoServicesPeripheral})

            const {device} = await waitForDevice(50)??{}
            expect(device).toBeUndefined()

            expect(logger.logEvent).toHaveBeenCalledWith({message:'starting peripheral discovery ...',interface:'ble'})
        })
        test('Unsupported', async () => {
            setupMocks(i,{peripheral:UnsupportedPeripheral})

            const {device} = await waitForDevice(50)??{}
            expect(device).toBeUndefined()

            expect(logger.logEvent).toHaveBeenCalledWith({message:'starting peripheral discovery ...',interface:'ble'})
        })


    })

    // check also isConnected, getName, setBinding


    describe('scan', () => {
        interface Mocks {
            
        }

        let i

        const P = (info:BlePeripheralInfo):Partial<BlePeripheralAnnouncement>=> {
            const p: Partial<BleRawPeripheral> = {
                address: info.advertisement.address,
                advertisement: info.advertisement,
                name:info.advertisement.localName 
            }

            const a:Partial<BlePeripheralAnnouncement> = {}
            a.advertisement = info.advertisement
            a.name = info.advertisement.localName
            a.serviceUUIDs = info.serviceUUIDs
            a.peripheral = p as BleRawPeripheral
            return a
        }
        const setupMocks =(iface,props:{discovered?:Partial<BleRawPeripheral>[]}) => {
            const {discovered=[]} = props

            discovered.forEach(peripheral=> {
                iface.matching.push(peripheral.name)
                iface.services.push({ts:Date.now(), service:{peripheral, advertisement:peripheral.advertisement, serviceUUIDs:peripheral.advertisement.serviceUuids}})
            })            
            
            iface.getAdapterFactory = jest.fn().mockReturnValue(
                { 
                    getProtocol:jest.fn( (services)=>{
                        const announced = services.map(s=>beautifyUUID(s))
                        if (announced.includes('1826') ) return ('fm')
                            // TODO mock other service->sensor mappings
                    })

                })
            iface.getBinding = jest.fn().mockReturnValue( {
                    resumeLogging:jest.fn(),
                    pauseLogging:jest.fn()
                })
    
        }

        const cleanupMocks = ( ) =>{
            jest.resetAllMocks()
        }

        beforeEach(() => {
            BleInterface.prototype['autoConnect'] = jest.fn()
            i = BleInterface.getInstance({logger: logger as EventLogger})
        })
        afterEach(async () => {

            await i.disconnect(); 

            // cleanup instance
            (BleInterface as any)._instance = undefined

            cleanupMocks()
            i.reset()
        })

        test('FM device',async ()=>{
            const discovered = [ FTMSPeripheral]
            setupMocks(i,{discovered})

            const devices = await i.scan({timeout:10})
            expect(devices).toEqual([{interface:'ble', name:'Volt', id:'c08248a35c70', address:'cb:ae:55:05:bc:99', protocol:'fm'}])
        })


    })


    describe('stopScan', () => {})

    describe('createPeripheral', () => {})
    describe('createPeripheralFromSettings', () => {})
    describe('createDeviceSetting', () => {})
    describe('waitForPeripheral', () => {})


} )