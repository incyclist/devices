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
            expect(logSpy).toHaveBeenCalledWith({message:'stopping scan ...'})

            expect(logSpy).toHaveBeenCalledWith({message:'scan stopped'})
        })

            

    })  

    describe('scan', () => {


    })  
    describe('stopScan', () => {})  

})