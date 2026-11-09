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

    describe('waitForPeripheral (probe before use)', () => {
        let dc: any
        const settings:any = { interface:'wifi', name:'Volt', address:'10.0.0.5', protocol:'fm' }
        const known = (): MulticastDnsAnnouncement =>
            ({ name:'Volt', address:'10.0.0.5', port:36866, serviceUUIDs:['1826'] } as MulticastDnsAnnouncement)

        beforeEach(() => {
            jest.useFakeTimers()
            DirectConnectInterface.prototype.autoConnect = jest.fn()
            iface = new DirectConnectInterface({ binding: mock })
            iface.on('log', ()=>{})
            dc = iface as any
            dc.logEvent = jest.fn()
        })

        afterEach(() => {
            dc.cancelWaits()
            iface?.removeAllListeners()
            jest.useRealTimers()
        })

        test('known-device placeholder is neither announced nor emitted on scan', () => {
            const onDevice = jest.fn()
            iface.on('device', onDevice)

            iface.addKnownDevice(settings)
            dc.emitCachedDevices()

            expect(onDevice).not.toHaveBeenCalled()
            expect(dc.getAll()).toHaveLength(1) // still cached for waitForPeripheral
        })

        test('resolves with the peripheral when the probe succeeds', async () => {
            iface.addKnownDevice(settings)
            dc.probePort = jest.fn().mockResolvedValue('open')

            const peripheral = await iface.waitForPeripheral(settings)

            expect(peripheral).toBeDefined()
            expect(dc.probePort).toHaveBeenCalledWith('10.0.0.5', 36866)
        })

        test('keeps waiting while the port is closed, then resolves once it opens', async () => {
            iface.addKnownDevice(settings)
            dc.probePort = jest.fn().mockResolvedValueOnce('closed').mockResolvedValue('open')

            let resolved = false
            const p = iface.waitForPeripheral(settings).then(r=>{ resolved = true; return r })

            await jest.advanceTimersByTimeAsync(100)
            expect(resolved).toBe(false)

            await jest.advanceTimersByTimeAsync(5000)
            await p
            expect(resolved).toBe(true)
            expect(dc.probePort).toHaveBeenCalledTimes(2)
        })

        test('resolves on a real mDNS announcement while the probe keeps failing', async () => {
            iface.addKnownDevice(settings)
            dc.probePort = jest.fn().mockResolvedValue('closed')

            const p = iface.waitForPeripheral(settings)
            await jest.advanceTimersByTimeAsync(100)

            dc.addService(known(), 'unfiltered') // placeholder is upgraded -> 'device' event
            const peripheral = await p
            expect(peripheral).toBeDefined()
        })

        test('falls back to the cached entry if the platform has no socket binding', async () => {
            iface.addKnownDevice(settings)
            dc.binding = { mdns }

            const peripheral = await iface.waitForPeripheral(settings)
            expect(peripheral).toBeDefined()
        })

        test('concurrent calls for the same device share one wait', async () => {
            iface.addKnownDevice(settings)
            dc.probePort = jest.fn().mockResolvedValue('open')

            const p1 = iface.waitForPeripheral(settings)
            const p2 = iface.waitForPeripheral(settings)

            expect(p2).toBe(p1)
            await p1
            expect(dc.probePort).toHaveBeenCalledTimes(1)
        })

        test('stops re-probing and drops its listener after cancel (pause background activity)', async () => {
            iface.addKnownDevice(settings)
            dc.probePort = jest.fn().mockResolvedValue('closed')

            const p = iface.waitForPeripheral(settings)
            p.catch(()=>{}) // settling (rejecting) it is covered by its own test below
            await jest.advanceTimersByTimeAsync(100)
            const calls = dc.probePort.mock.calls.length

            dc.cancelWaits()
            await jest.advanceTimersByTimeAsync(20000)

            expect(dc.probePort.mock.calls.length).toBe(calls)
            expect(iface.listenerCount('device')).toBe(0)
        })

        // a caller (e.g. BleAdapter.stop()) awaits this promise to know a cancelled/abandoned wait
        // has genuinely finished - it must always settle, never hang forever
        test('settles (rejects) once cancelled, instead of leaving the caller waiting forever', async () => {
            iface.addKnownDevice(settings)
            dc.probePort = jest.fn().mockResolvedValue('closed')

            const p = iface.waitForPeripheral(settings)
            const outcome = p.then(()=>'resolved').catch(()=>'rejected')

            await jest.advanceTimersByTimeAsync(100)
            dc.cancelWaits()

            await expect(outcome).resolves.toBe('rejected')
        })

        test('settles (rejects) once its lifetime is abandoned, instead of leaving the caller waiting forever', async () => {
            iface.addKnownDevice(settings)
            dc.probePort = jest.fn().mockResolvedValue('closed')

            const p = iface.waitForPeripheral(settings)
            const outcome = p.then(()=>'resolved').catch(()=>'rejected')

            await jest.advanceTimersByTimeAsync(5*60*1000 + 1000)

            await expect(outcome).resolves.toBe('rejected')
        })
    })

    describe('probePort', () => {
        let dc: any
        beforeEach(() => {
            DirectConnectInterface.prototype.autoConnect = jest.fn()
        })

        const ifaceWithSocket = (socket:any) => {
            iface = new DirectConnectInterface({ binding: { mdns, net:{ createSocket: ()=>socket } } })
            dc = iface as any
            dc.logEvent = jest.fn()
        }
        const fakeSocket = (onConnect:(s:any)=>void) => {
            const { EventEmitter } = require('events')
            const s:any = new EventEmitter()
            s.destroy = jest.fn()
            s.write = jest.fn()
            s.connect = jest.fn(()=>{ setTimeout(()=>onConnect(s),0) })
            return s
        }

        test('open', async () => {
            ifaceWithSocket(fakeSocket(s=>s.emit('connect')))
            expect(await dc.probePort('10.0.0.5', 36866)).toBe('open')
        })

        test('closed on connection error', async () => {
            ifaceWithSocket(fakeSocket(s=>s.emit('error', Object.assign(new Error('refused'),{code:'ECONNREFUSED'}))))
            expect(await dc.probePort('10.0.0.5', 36866)).toBe('closed')
        })

        test('timeout if nothing happens', async () => {
            ifaceWithSocket(fakeSocket(()=>{}))
            expect(await dc.probePort('10.0.0.5', 36866, 20)).toBe('timeout')
        })

        test('socket is destroyed after the probe', async () => {
            const s = fakeSocket(s=>s.emit('connect'))
            ifaceWithSocket(s)
            await dc.probePort('10.0.0.5', 36866)
            expect(s.destroy).toHaveBeenCalled()
        })
    })

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