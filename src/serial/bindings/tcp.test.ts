import SerialPortProvider from "../serialport"
import net from 'net'
import {scanSubNet, TCPBinding} from './tcp'
import ByteLength from '@serialport/parser-byte-length'

const TEST_PORT = 12345
const TEST_PATH = `localhost:${TEST_PORT}`

const sleep = async (ms)=> new Promise( done => setTimeout(done,ms))

describe( 'TCPPort' ,()=> {

    test.skip('scanSubnet',async()=>{

        const res = await scanSubNet('127.0.0',3000)        
        expect(res.length).toBe(1)
        
    })

    describe('SerialPort',()=> {

        let spp;
        let server;
        let serverSocket
        const fnReceive = jest.fn()
        

        beforeEach( async ()=>{            
            // reset the singelton
            SerialPortProvider._instance = new SerialPortProvider();
            spp = SerialPortProvider.getInstance()                        
            spp.setBinding('tcp',TCPBinding)

            // start socket server
            server = net.createServer( (socket)=>{                
                serverSocket = socket;
                serverSocket.on('data',(data) => {
                    fnReceive(data);
                    const str = data.toString()
                    serverSocket.write(Buffer.from(str+' world'))
                })

                serverSocket.on('connected',(info)=>{ 
                    console.log('connected',info)
                })
            })

            return new Promise ( resolve=> {
                server.listen( TEST_PORT, 'localhost',resolve)                    
            })
            



        })
        afterEach( ()=>{
            if (serverSocket)
                serverSocket.destroy();
            server.close();
            
        })
        const connect = (port:string):Promise<any> => new Promise( resolve=> {
            const sp = spp.getSerialPort('tcp', {path:port});
            if (!sp) {
                resolve(false)
                return;
            }
            
            sp.on('error',()=>{ resolve({connected:false}); sp.removeAllListeners()})
            sp.once('open',()=>{resolve({connected:true, sp}); sp.removeAllListeners()})
            sp.open()
    
        })
    

        test('getSerialPort tcp valid path',async ()=>{

            // even on Windows, this should not fail, as we are not (yet) opening
            const res = await connect(TEST_PATH)
            expect(res.connected).toBeTruthy()

        })


        test('getSerialPort tcp valid path - write',async ()=>{

            // even on Windows, this should not fail, as we are not (yet) opening
  
            const {connected,sp} = await connect(TEST_PATH)
            sp.write('Hello')

            // give some time for TCP communication
            await sleep(50)
           
            expect(fnReceive).toBeCalledWith( Buffer.from('Hello'))
            

        })

        test('getSerialPort tcp valid path - read ByteLength Parser',async ()=>{
 
            const sp = spp.getSerialPort('tcp', {path:TEST_PATH});
            
            const read = (): Promise<Buffer>=> {
                return new Promise( done => {
                    const parser = sp.pipe(new ByteLength({length: 11}))
                    parser.on('data', (data)=>{
                        done(data)
                        sp.unpipe()
                    })
                })
            }


            await sp.open()
            sp.write('Hello')
          
            const res = await read ()
            
            expect(res.toString()).toBe('Hello world')
            

        })

        test('getSerialPort tcp valid path - "data" event',async ()=>{
 
            const sp = spp.getSerialPort('tcp', {path:TEST_PATH});
            
            const read = (): Promise<Buffer>=> {
                return new Promise( done => {
                    sp.on('data',(buffer:Buffer)=>{
                        done(buffer)
                    })
                })
            }


            await sp.open()
            sp.write('Hello')
         
            const res = await read ()
            
            expect(res.toString()).toBe('Hello world')
            

        })

        test('getSerialPort tcp invalid port',async ()=>{


            // even on Windows, this should not fail, as we are not (yet) opening
            const res = await connect('localhost:80123')
            expect(res.connected).toBeFalsy()

        })

    })

})