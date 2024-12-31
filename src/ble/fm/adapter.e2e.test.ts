import { Bonjour } from 'bonjour-service'
import net from 'net';
import DirectConnectInterface, { DirectConnectInterfaceFactory } from "../../direct-connect/base/interface";
import AdapterFactory  from '../../factories/adapters';
import { BleMultiTransportInterfaceFactory } from '../factories';
import { BleInterface, BleInterfaceFactory } from '../base/interface';
import Noble from '@stoprocent/noble/lib/noble';
import defaultBinding from '@stoprocent/noble/lib/resolve-bindings';

class MDNSBinding {
    protected bonjour?:Bonjour    
    connect() {
        this.bonjour = new Bonjour()
        
    }

    disconnect() {
        if (this.bonjour) {
            this.bonjour.destroy()
            delete this.bonjour 
        }
    }

    find(opts , onUp) {
        this.bonjour?.find(opts, (s)=>{ 
            this.handleAnnouncement(s,onUp) 
        })
    }       

    handleAnnouncement(service,callback) {
        const {name,txt,port,referer,protocol} = service
        const announcement = {
            name,address:referer?.address,protocol,port,
            serialNo:txt?.['serial-number'], 
            serviceUUIDs:txt?.['ble-service-uuids']?.split(',')
        }
        if (callback)
            callback(announcement)
    }
        
}

const createWifiBinding = ()=>{
    return {
        mdns: new MDNSBinding(),
        net: {
            createSocket: ()=>new net.Socket()
        } 
    }
}
describe('BleFmAdapter E2E',()=>{


    describe('Wifi-Start',()=>{

        let adapter

        afterEach(async ()=>{
            const tsStart = Date.now()
            console.log( Date.now()-tsStart, 'before adaprer.stop')
            await adapter.stop()
            console.log( Date.now()-tsStart, 'after adaprer.stop')
            await DirectConnectInterface.getInstance().disconnect()
            console.log( Date.now()-tsStart, 'after DC disconnect')
            AdapterFactory.reset()
            console.log( Date.now()-tsStart, 'AdapterFactory reset')
        })

        test('normal Wifi Start',async ()=>{

            const binding = createWifiBinding()
            DirectConnectInterface.getInstance({binding})
            BleMultiTransportInterfaceFactory.register('wifi',DirectConnectInterfaceFactory)
        
            
            const settings = { interface: "wifi", name: "VOLT 2A34", protocol: "fm" }
            adapter = AdapterFactory.create(settings)
            expect(adapter).toBeDefined()
            const started = await adapter.start({timeout:40000})
            expect(started).toBeTruthy()

            await adapter.pause()

            const restarted = await adapter.start({timeout:4000})
            expect(restarted).toBeTruthy()


        },80000)

    })

    describe('Ble-Start',()=>{

        let adapter

        afterEach(async ()=>{
            await adapter.stop()
            await BleInterface.getInstance().disconnect()
            AdapterFactory.reset()
        },10000)

        test('normal Ble Start',async ()=>{

            const binding = new Noble( defaultBinding() )
            BleInterface.getInstance({binding})
            BleMultiTransportInterfaceFactory.register('ble',BleInterfaceFactory)
        
            
            const settings = { interface: "ble", name: "Volt", protocol: "fm", address:"517b656007e9bfee936afeb90129e3f9" }
            adapter = AdapterFactory.create(settings)
            expect(adapter).toBeDefined()
            const started = await adapter.start()
            expect(started).toBeTruthy()

            /*

            console.log('~~~ PAUSE')
            await adapter.pause()

            console.log('~~~ RESTART')
            const restarted = await adapter.start({timeout:20000})
            expect(restarted).toBeTruthy()
*/
            //await sleep(10000)


        },20000)

    })

})