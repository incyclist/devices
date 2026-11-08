import { write } from "fs"
import { MulticastDnsAnnouncement } from "../bindings"
import { DirectConnectPeripheral } from "./peripheral"

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
})