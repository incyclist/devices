import SerialPortProvider from "./serialport"
import { autoDetect } from '@serialport/bindings-cpp'
import { MockBinding } from '@serialport/binding-mock'

describe('serialport',()=>{

    let spp;
    beforeEach( ()=>{
        MockBinding.reset()
        SerialPortProvider._instance = new SerialPortProvider();
        spp = SerialPortProvider.getInstance()
    })
    afterEach( ()=>{
        MockBinding.reset()
        
    })

    const connect = (port:string) => new Promise( resolve=> {
        const sp = spp.getSerialPort('serial', {path:port});
        sp.on('error',(err)=>{ resolve({connected:false, error:err.message}); sp.removeAllListeners()})
        sp.once('open',()=>{resolve({connected:true}); sp.removeAllListeners()})
        sp.open()
    })


    const get = (port:string) => new Promise( resolve=> {
        const sp = spp.getSerialPort('serial', {path:port});
        if (!sp) {
            resolve(false)
            return;
        }
        setTimeout( ()=>{ resolve(true); sp.removeAllListeners()}, 100)
        sp.on('error',()=>{ resolve(false); sp.removeAllListeners()})
    })

    test('getSerialPort cpp',async ()=>{

        spp.setBinding('serial',autoDetect())

        // even on Windows, this should not fail, as we are not (yet) opening
        const canGetLinux = get('/dev/ttyS7')
        expect(canGetLinux).toBeTruthy()

        // even on Linux, this should not fail, as we are not (yet) opening
        const canGetWindows = get('COM1')
        expect(canGetWindows).toBeTruthy()

    })

    test('getSerialPort - mock',async ()=>{
        spp.setBinding('serial',MockBinding)
        MockBinding.createPort('/dev/ttyS7')


        let res
        res = await connect('/dev/ttyS7');
        expect(res.connected).toBeTruthy()

        res = await connect('/dev/ttyS1');
        expect(res.connected).toBeFalsy()
        expect(res.error).toBeDefined()

    })

})