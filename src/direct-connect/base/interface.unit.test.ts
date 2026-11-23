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

    describe('background activity (pause reasons)', () => {
        let i:any

        beforeEach(() => {
            jest.resetAllMocks()
            DirectConnectInterface.prototype.autoConnect = jest.fn()
            i = new DirectConnectInterface({binding:mock})
            i.connected = true
            i.logEvent = jest.fn()
            mdns.find = jest.fn()
            mdns.connect = jest.fn()
            mdns.disconnect = jest.fn()
        })
        afterEach(() => {
            i.removeAllListeners()
        })

        test('the discovery stays paused until every reason has been released', async () => {
            await i.pauseBackgroundActivity('app-background')
            await i.pauseBackgroundActivity('ride')
            expect(mdns.disconnect).toHaveBeenCalledTimes(1)

            await i.resumeBackgroundActivity('app-background')
            expect(i.backgroundPaused).toBe(true)
            expect(mdns.connect).not.toHaveBeenCalled()

            await i.resumeBackgroundActivity('ride')
            expect(i.backgroundPaused).toBe(false)
            expect(mdns.connect).toHaveBeenCalledTimes(1)
            expect(mdns.find).toHaveBeenCalled()
        })

        test('without a reason the pause is attributed to the app going to the background', async () => {
            await i.pauseBackgroundActivity()
            await i.pauseBackgroundActivity('ride')
            await i.resumeBackgroundActivity('ride')
            expect(i.backgroundPaused).toBe(true)

            await i.resumeBackgroundActivity()
            expect(i.backgroundPaused).toBe(false)
        })

        test('pausing twice for the same reason, or resuming a reason that is not set, does nothing', async () => {
            await i.resumeBackgroundActivity('ride')
            expect(mdns.connect).not.toHaveBeenCalled()

            await i.pauseBackgroundActivity('ride')
            await i.pauseBackgroundActivity('ride')
            expect(mdns.disconnect).toHaveBeenCalledTimes(1)
        })

        test('the log carries the reason, all reasons and the interface', async () => {
            await i.pauseBackgroundActivity('ride')
            expect(i.logEvent).toHaveBeenCalledWith(O({message:'pausing background activity', reason:'ride', reasons:'ride', interface:'wifi'}))
        })

        describe('announcement expiry', () => {
            const old = () => Date.now() - 11*60*1000
            const add = () => i.services.push({ts:old(), source:'mdns', service:{name:'Wahoo', address:'1.2.3.4', port:1, serviceUUIDs:['1818']}})

            test('announcements expire after 10 minutes while the discovery is running', () => {
                add()
                expect(i.getAll()).toHaveLength(0)
                expect(i.findAllByName('Wahoo')).toHaveLength(0)
                expect(i.findByNameAndAddress('Wahoo','1.2.3.4')).toBeUndefined()
            })

            test('announcements do not expire while the discovery is paused: nothing could refresh them', async () => {
                add()
                await i.pauseBackgroundActivity('ride')
                expect(i.getAll()).toHaveLength(1)
                expect(i.findAllByName('Wahoo')).toHaveLength(1)
                expect(i.findByNameAndAddress('Wahoo','1.2.3.4')).toBeDefined()
            })
        })

        describe('waitForPeripheral', () => {
            const settings:any = {interface:'wifi', name:'Wahoo', protocol:'wahoo', address:'1.2.3.4'}

            beforeEach(() => {
                jest.useFakeTimers()
                i.createPeripheralFromSettings = jest.fn().mockReturnValue(undefined)
            })
            afterEach(() => { jest.useRealTimers() })

            test('resolves immediately if the peripheral is already announced, without browsing', async () => {
                i.createPeripheralFromSettings = jest.fn().mockReturnValue({id:'p'})
                await i.pauseBackgroundActivity('ride')
                mdns.connect.mockClear()

                await expect(i.waitForPeripheral(settings)).resolves.toEqual({id:'p'})
                expect(mdns.connect).not.toHaveBeenCalled()
            })

            test('while paused: browses on its own, and releases the browsers when the device was found', async () => {
                await i.pauseBackgroundActivity('ride')
                mdns.connect.mockClear()
                mdns.disconnect.mockClear()

                const promise = i.waitForPeripheral(settings)
                expect(mdns.connect).toHaveBeenCalledTimes(1)
                expect(mdns.find).toHaveBeenCalled()

                i.createPeripheralFromSettings = jest.fn().mockReturnValue({id:'p'})
                i.emit('device', {name:'Wahoo'})

                await expect(promise).resolves.toEqual({id:'p'})
                expect(mdns.disconnect).toHaveBeenCalledTimes(1)
            })

            test('while paused: does not wait forever', async () => {
                await i.pauseBackgroundActivity('ride')
                mdns.disconnect.mockClear()
                const promise = i.waitForPeripheral(settings)
                const assertion = expect(promise).rejects.toThrow('peripheral not found')

                await jest.advanceTimersByTimeAsync(30000)

                await assertion
                expect(mdns.disconnect).toHaveBeenCalledTimes(1)
                expect(i.listenerCount('device')).toBe(0)
            })
        })
    })

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