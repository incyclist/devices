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
})