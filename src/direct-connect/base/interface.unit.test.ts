import { resolveNextTick } from "../../utils/utils"
import { DirectConnectBinding, MulticastDnsAnnouncement, MulticastDnsBinding } from "../bindings"
import DirectConnectInterface from "./interface"
import net from 'net'
const mdns:MulticastDnsBinding = {
    
    find: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn()   
}

const mock:DirectConnectBinding = {
    mdns,
    net: {
        createSocket: ()=>new net.Socket()
    }    
}

const O = (o)=>expect.objectContaining(o)

describe('DirectConnectInterface', () => { 

    let iface:DirectConnectInterface
    const logSpy = jest.fn()
    const deviceSpy = jest.fn()

    describe('connect', () => {
        afterEach(() => {
            jest.resetAllMocks()
            iface?.removeAllListeners()
        })
    

        test('normal connection', async () => {
            // avoid autoconnect
            DirectConnectInterface.prototype.autoConnect = jest.fn()
            iface = new DirectConnectInterface({binding:mock})
            iface.on('log',logSpy)
            iface.on('device',deviceSpy)
            
            mdns.find = jest.fn( ( filter,cb ) => {
                const announcement:Partial<MulticastDnsAnnouncement> = { name: 'TEST', address: '89.207.132.170', port: 1234, serviceUUIDs: ['1818'] }
                if (cb)
                    cb(  announcement as MulticastDnsAnnouncement) 
            })

            const success = await iface.connect()
            expect(success).toBe(true)  
            expect(mdns.find).toHaveBeenCalledWith({type:'wahoo-fitness-tnp'},expect.anything())
            expect(logSpy).toHaveBeenCalledWith({message:'starting multicast DNS scan ..'})

            await resolveNextTick()
            expect(logSpy).toHaveBeenCalledWith(O({message:'device announced', device:'TEST'}))
            expect(deviceSpy).toHaveBeenCalled()
            
        })
        test('no binding', async () => {
            // avoid autoconnect
            DirectConnectInterface.prototype.autoConnect = jest.fn()
            iface = new DirectConnectInterface({})
            iface.on('log',logSpy)

            const success = await iface.connect()
            expect(success).toBe(false)  
            expect(mdns.find).not.toHaveBeenCalledWith({type:'wahoo-fitness-tnp'},expect.anything())
            expect(logSpy).toHaveBeenCalledWith({message:'Direct Connect not available'})

        })
        test('reconnect', async () => {
            // avoid autoconnect
            DirectConnectInterface.prototype.autoConnect = jest.fn()
            iface = new DirectConnectInterface({binding:mock})
            iface.on('log',logSpy)

            const success = await iface.connect(true)
            expect(success).toBe(true)  
            expect(mdns.find).toHaveBeenCalledWith({type:'wahoo-fitness-tnp'},expect.anything())
            expect(logSpy).not.toHaveBeenCalledWith({message:'starting multicast DNS scan ..'})

        })
        test('logging disabled', async () => {
            // avoid autoconnect
            DirectConnectInterface.prototype.autoConnect = jest.fn()
            iface = new DirectConnectInterface({binding:mock})
            iface.on('log',logSpy)
            iface.pauseLogging()

            const success = await iface.connect()
            expect(success).toBe(true)  
            expect(mdns.find).toHaveBeenCalledWith({type:'wahoo-fitness-tnp'},expect.anything())
            expect(logSpy).not.toHaveBeenCalledWith({message:'starting multicast DNS scan ..'})

        })

    })  

    describe('disconnect', () => {
        afterEach(() => {
            jest.resetAllMocks()   
            iface?.removeAllListeners()
        })
    
        test('normal disconnection', async () => {
            // avoid autoconnect
            DirectConnectInterface.prototype.autoConnect = jest.fn()
            iface = new DirectConnectInterface({binding:mock})
            iface.on('log',logSpy)
            
            await iface.connect()
            

            const success = await iface.disconnect()    
            expect(success).toBe(true)  
            expect(logSpy).toHaveBeenCalledWith( {message:'Disconnecting from Direct Connect'})
        })

        test('no binding ', async () => {
            iface = new DirectConnectInterface({})
            iface.on('log',logSpy)
          

            const success = await iface.disconnect()    
            expect(success).toBe(true)  
            expect(logSpy).not.toHaveBeenCalled()
        })

        test('during scan', async () => {
            iface = new DirectConnectInterface({binding:mock})
            iface.on('log',logSpy)

            iface.scan({timeout:10000})
            await resolveNextTick()
            jest.resetAllMocks()

            const success = await iface.disconnect()    
            expect(success).toBe(true)  
            expect(logSpy).toHaveBeenCalledWith({message:'stopping scan ...',interface:'wifi'})

            expect(logSpy).toHaveBeenCalledWith({message:'scan stopped'})
        })

            

    })  

    describe('scan', () => {

    })
    describe('stopScan', () => {})

    describe('waitForPeripheral', () => {})

    describe('addService / discovery cache identity heuristic (FIXES_BACKLOG #14)', () => {

        let dc: any

        const A = (name: string, address: string, extra: Partial<MulticastDnsAnnouncement> = {}): MulticastDnsAnnouncement =>
            ({ name, address, port: 1234, serviceUUIDs: ['1818'], ...extra } as MulticastDnsAnnouncement)

        beforeEach(() => {
            DirectConnectInterface.prototype.autoConnect = jest.fn()
            iface = new DirectConnectInterface({ binding: mock })
            dc = iface as any
        })

        afterEach(() => {
            jest.resetAllMocks()
            iface?.removeAllListeners()
        })

        test('single re-announcement with a changed address silently updates the stored (known-device) entry in place (no 2nd entry, no collision)', () => {
            // the "stored" device: a known-device placeholder built from persisted (possibly stale)
            // settings, e.g. via addKnownDevice() at startup
            dc.addService(A('Volt', '10.0.0.5'), 'known-device')
            expect(dc.getAll()).toHaveLength(1)

            // router reassigned the device a new IP - only one address has ever been seen for this
            // name this session, so the real mDNS announcement is treated as the same device and
            // silently corrects the stored address, rather than creating a 2nd entry
            dc.addService(A('Volt', '10.0.0.9'), 'unfiltered')

            const all = dc.getAll()
            expect(all).toHaveLength(1)
            expect(all[0].service.address).toBe('10.0.0.9')
            expect(dc.hasNameCollision('Volt')).toBe(false)
        })

        test('two same-session announcements, same name, different address, surface as distinct entries and stay distinct', () => {
            dc.addService(A('Volt', '10.0.0.5'), 'unfiltered')
            dc.addService(A('Volt', '10.0.0.9'), 'unfiltered')

            const all = dc.getAll()
            expect(all).toHaveLength(2)
            expect(all.map(a => a.service.address).sort()).toEqual(['10.0.0.5', '10.0.0.9'])
            expect(dc.hasNameCollision('Volt')).toBe(true)

            // a 3rd announcement repeating one of the two known addresses is just a refresh, not a 3rd entry
            dc.addService(A('Volt', '10.0.0.5'), 'unfiltered')
            expect(dc.getAll()).toHaveLength(2)
        })

        test('a stale known-device placeholder never clobbers a live mDNS observation at a different address', () => {
            // real, live mDNS announcement observed first
            dc.addService(A('Volt', '10.0.0.9'), 'unfiltered')

            // a known-device placeholder built from stale persisted settings (old address) is added afterwards
            dc.addService(A('Volt', '10.0.0.5'), 'known-device')

            const all = dc.getAll()
            expect(all).toHaveLength(1)
            expect(all[0].service.address).toBe('10.0.0.9')
            expect(all[0].source).toBe('mdns')
        })

        test('a known-device placeholder is corrected in place once the real mDNS announcement arrives (stale IP fix)', () => {
            // placeholder built from stale persisted address at startup
            dc.addService(A('Volt', '10.0.0.5'), 'known-device')
            expect(dc.getAll()[0].service.address).toBe('10.0.0.5')

            // the real device announces its actual (different) current address
            dc.addService(A('Volt', '10.0.0.9'), 'unfiltered')

            const all = dc.getAll()
            expect(all).toHaveLength(1)
            expect(all[0].service.address).toBe('10.0.0.9')
            expect(all[0].source).toBe('mdns')
        })

        test('two distinct devices already split apart are not merged by a later known-device placeholder for either address', () => {
            dc.addService(A('Volt', '10.0.0.5'), 'unfiltered')
            dc.addService(A('Volt', '10.0.0.9'), 'unfiltered')
            expect(dc.getAll()).toHaveLength(2)

            // a known-device placeholder re-add (e.g. initWifiInterface() called again) for one of them
            dc.addService(A('Volt', '10.0.0.5'), 'known-device')

            const all = dc.getAll()
            expect(all).toHaveLength(2)
            expect(all.map(a => a.service.address).sort()).toEqual(['10.0.0.5', '10.0.0.9'])
        })

        test('hasNameCollision is false for a name that was never announced', () => {
            expect(dc.hasNameCollision('unknown')).toBe(false)
        })
    })

    describe('createDeviceSetting - id from serialNo (FIXES_BACKLOG #14)', () => {

        let dc: any

        beforeEach(() => {
            DirectConnectInterface.prototype.autoConnect = jest.fn()
            iface = new DirectConnectInterface({ binding: mock })
            dc = iface as any
        })

        test('populates id from the announcement serialNo when present', () => {
            const settings = dc.createDeviceSetting({ name: 'KICKR CORE', address: '10.0.0.5', port: 1234, serviceUUIDs: ['1818'], serialNo: 'ABCD1234' })
            expect(settings.id).toBe('ABCD1234')
        })

        test('leaves id undefined when the announcement has no serialNo', () => {
            const settings = dc.createDeviceSetting({ name: 'Volt', address: '10.0.0.5', port: 1234, serviceUUIDs: ['1818'] })
            expect(settings.id).toBeUndefined()
        })
    })

    describe('createPeripheralFromSettings - address-preferential lookup (FIXES_BACKLOG #14)', () => {

        let dc: any

        beforeEach(() => {
            DirectConnectInterface.prototype.autoConnect = jest.fn()
            iface = new DirectConnectInterface({ binding: mock })
            dc = iface as any
        })

        test('resolves the address-matching entry when two devices share a name', () => {
            dc.addService({ name: 'Volt', address: '10.0.0.5', port: 1234, serviceUUIDs: ['1818'] }, 'unfiltered')
            dc.addService({ name: 'Volt', address: '10.0.0.9', port: 1234, serviceUUIDs: ['1818'] }, 'unfiltered')

            const peripheral = dc.createPeripheralFromSettings({ interface: 'wifi', name: 'Volt', address: '10.0.0.9' })
            expect(peripheral).toBeDefined()
            expect(peripheral.getInfo().address).toBe('10.0.0.9')
        })
    })

})