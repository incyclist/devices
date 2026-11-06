import { write } from "fs"
import { MulticastDnsAnnouncement } from "../bindings"
import { DirectConnectPeripheral, OpenBikeControlPeripheral } from "./peripheral"

describe('DirectConnect Peripheral',()=>{

    const M = (str)=>Buffer.from(str,'hex')

    describe('subscribe',()=>{ 
        test('subscribe',async ()=>{

            let sendMock = jest.fn()
            const setupMocks = (p)=>{
                p.send = sendMock
                p.msgSeqNo = 1
            }

            const announcement:MulticastDnsAnnouncement = {
                type:'wahoo-fitness-tnp',
                name:'TEST',
                address:'192.168.1.1',
                protocol:'tcp',
                port:36866,
                serialNo:'1234567',
                serviceUUIDs:['0xFC82','0x1818','0x1826','00000001-19CA-4651-86E5-FA29DCDD09D1','A026EE0D-0A7D-4AB3-97FA-F1500F9FEB8B'],
                transport:'wifi'}
            
            const p = new DirectConnectPeripheral(announcement)
            sendMock = jest.fn ( async (c,b)=>{
                return M('01050200001100002a3700001000800000805f9b34fb01')
            })
            setupMocks(p)

            //console.log(sendMock.calls[0][0])
            const success = await p.subscribe('2A37',()=>{})
            //expect(sendMock).toHaveBeenCalledWith(2,M('01050200001100002a3700001000800000805f9b34fb0101'))
            expect(success).toBe(true)
        })

    })

    describe('subscribeSelected',()=>{

        const announcement:MulticastDnsAnnouncement = {
            type:'wahoo-fitness-tnp',
            name:'TEST',
            address:'192.168.1.1',
            protocol:'tcp',
            port:36866,
            serialNo:'1234567',
            serviceUUIDs:['0x1826'],
            transport:'wifi'}

        test('retries with the plain uuid string, not an object, when the initial subscribe fails',async ()=>{

            const p = new DirectConnectPeripheral(announcement)

            p.discoverServices = jest.fn(async ()=>['1826'])
            p.discoverCharacteristics = jest.fn(async ()=>([
                {uuid:'2AD2', properties:['notify']},
                {uuid:'2ADA', properties:['notify']},
            ]))

            let firstAttemptDone = false
            p.subscribe = jest.fn(async (uuid:string)=>{
                if (uuid==='2ADA' && !firstAttemptDone) {
                    firstAttemptDone = true
                    return false // simulate a failed/unconfirmed first attempt
                }
                return true
            })

            const result = await p.subscribeSelected(['2AD2','2ADA'],()=>{})

            expect(result).toBe(true)
            // regression guard: retry must pass the uuid string itself, never undefined
            expect(p.subscribe).toHaveBeenCalledWith('2ADA', expect.any(Function))
            expect(p.subscribe).not.toHaveBeenCalledWith(undefined, expect.any(Function))
        })

    })

    describe('OpenBikeControlPeripheral',()=>{

        const announcement:MulticastDnsAnnouncement = {
            type:'openbikecontrol',
            name:'BikeControl',
            address:'192.168.1.2',
            protocol:'tcp',
            port:4711,
            serviceUUIDs:['d273f680-d548-419d-b9d1-fa0472345229'],
            transport:'wifi'}

        const BUTTON_STATE = 'd273f681-d548-419d-b9d1-fa0472345229'

        let p:any
        beforeEach( ()=>{
            p = new OpenBikeControlPeripheral(announcement)
            p.logEvent = jest.fn()
        })

        test('button state messages are notified on the Button State characteristic',async ()=>{
            const callback = jest.fn()
            const success = await p.subscribeSelected([BUTTON_STATE],callback)
            expect(success).toBe(true)

            await p.onData(M('010101'))
            expect(callback).toHaveBeenCalledWith(BUTTON_STATE, M('010101'))
        })

        test('device status is skipped, also if followed by a button state message in the same packet',async ()=>{
            const callback = jest.fn()
            await p.subscribe(BUTTON_STATE,callback)

            await p.onData(M('025501'))
            expect(callback).not.toHaveBeenCalled()

            await p.onData(M('0255010102010300'))
            expect(callback).toHaveBeenCalledTimes(1)
            expect(callback).toHaveBeenCalledWith(BUTTON_STATE, M('0102010300'))
        })

        test('writes are sent unchanged',async ()=>{
            const write = jest.fn()
            p.connect = jest.fn(async ()=>true)
            p.socket = { write }

            await p.write('d273f683-d548-419d-b9d1-fa0472345229', M('0401'), {withoutResponse:true})
            expect(write).toHaveBeenCalledWith(M('0401'))
        })

        test('create returns one instance per address and port',()=>{
            expect(OpenBikeControlPeripheral.create(announcement)).toBe(OpenBikeControlPeripheral.create({...announcement}))
            expect(OpenBikeControlPeripheral.create(announcement)).not.toBe(OpenBikeControlPeripheral.create({...announcement, port:4712}))
        })
    })
})
