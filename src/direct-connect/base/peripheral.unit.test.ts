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
    describe('connection handling',()=>{
        const announcement:MulticastDnsAnnouncement = {
            type:'wahoo-fitness-tnp', name:'TEST', address:'192.168.1.1', protocol:'tcp',
            port:36866, serviceUUIDs:['0x1826'], transport:'wifi'}

        const makeSocket = ()=>{
            const { EventEmitter } = require('events')
            const s:any = new EventEmitter()
            s.destroy = jest.fn()
            s.write = jest.fn()
            s.connect = jest.fn() // never connects
            return s
        }

        const setup = (socket)=>{
            const p:any = new DirectConnectPeripheral(announcement)
            p.getBinding = ()=>({ net:{ createSocket:()=>socket } })
            p.logEvent = jest.fn()
            return p
        }

        test('connect timeout leaves no socket behind and isConnected() stays false',async ()=>{
            jest.useFakeTimers()
            try {
                const socket = makeSocket()
                const p = setup(socket)

                const res = p.connect()
                await jest.advanceTimersByTimeAsync(3000)

                expect(await res).toBe(false)
                expect(p.isConnected()).toBe(false)
                expect(p.socket).toBeUndefined()
                expect(socket.destroy).toHaveBeenCalled()
            }
            finally {
                jest.useRealTimers()
            }
        })

        test('send rejects without writing when the connection fails',async ()=>{
            const socket = makeSocket()
            const p = setup(socket)
            p.connect = jest.fn().mockResolvedValue(false)

            await expect(p.send(1,Buffer.from('00','hex'))).rejects.toThrow('not connected')
            expect(socket.write).not.toHaveBeenCalled()
        })

        test('send rejects if no response arrives in time',async ()=>{
            jest.useFakeTimers()
            try {
                const socket = makeSocket()
                const p = setup(socket)
                p.connect = jest.fn().mockResolvedValue(true)
                p.socket = socket
                p.socketConnected = true

                const res = p.send(1,Buffer.from('00','hex'))
                const assertion = expect(res).rejects.toThrow('response timeout')
                await jest.advanceTimersByTimeAsync(6000)
                await assertion
                expect(socket.write).toHaveBeenCalled()
            }
            finally {
                jest.useRealTimers()
            }
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

        describe('messages that arrive together or split',()=>{
            let callback:any
            beforeEach( async ()=>{
                callback = jest.fn()
                await p.subscribe(BUTTON_STATE,callback)
            })
            const received = ()=>callback.mock.calls.map( ([,data])=>data.toString('hex'))

            test('press and release of the same button in one read',async ()=>{
                await p.onData(M('010101010100'))
                expect(received()).toEqual(['010101','010100'])
            })

            test('press and release of several buttons in one read',async ()=>{
                await p.onData(M('01100120010110002000'))
                expect(received()).toEqual(['0110012001','0110002000'])
            })

            test('press of one button followed by a press of another button',async ()=>{
                await p.onData(M('011001012001'))
                expect(received()).toEqual(['011001','012001'])
            })

            test('Shift Up and Shift Down pressed and released together in one read',async ()=>{
                await p.onData(M('01010102010101000200'))
                expect(received()).toEqual(['0101010201','0101000200'])
            })

            test('button state followed by device status in one read',async ()=>{
                await p.onData(M('011001025501'))
                expect(received()).toEqual(['011001'])
                expect(p.logEvent).toHaveBeenCalledWith(expect.objectContaining({message:'device status', battery:0x55}))
            })

            test('a message split across two reads',async ()=>{
                await p.onData(M('0110'))
                expect(callback).not.toHaveBeenCalled()
                await p.onData(M('01'))
                expect(received()).toEqual(['011001'])
            })

            test('a device status split across two reads',async ()=>{
                await p.onData(M('0255'))
                await p.onData(M('01010101'))
                expect(p.logEvent).toHaveBeenCalledWith(expect.objectContaining({message:'device status', battery:0x55}))
                expect(received()).toEqual(['010101'])
            })
        })

        test('subscribing twice does not report a button press twice',async ()=>{
            const callback = jest.fn()
            await p.subscribe(BUTTON_STATE,callback)
            await p.subscribe(BUTTON_STATE,callback)

            await p.onData(M('010101'))
            expect(callback).toHaveBeenCalledTimes(1)
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
