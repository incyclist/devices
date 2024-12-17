import { Bonjour } from 'bonjour-service'
import net from 'net';
import DirectConnectInterface, { DirectConnectInterfaceFactory } from "../../direct-connect/base/interface";
import AdapterFactory  from '../../factories/adapters';
import { BleMultiTransportInterfaceFactory } from '../factories';
import { BleInterface, BleInterfaceFactory } from '../base/interface';
import Noble from '@abandonware/noble/lib/noble';
import defaultBinding from '@abandonware/noble/lib/resolve-bindings';

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
            await adapter.stop()
            await DirectConnectInterface.getInstance().disconnect()
            AdapterFactory.reset()
        })

        test('normal Wifi Start',async ()=>{

            const binding = createWifiBinding()
            DirectConnectInterface.getInstance({binding})
            BleMultiTransportInterfaceFactory.register('wifi',DirectConnectInterfaceFactory)
        
            
            const settings = { interface: "wifi", name: "VOLT 2A34", protocol: "fm" }
            adapter = AdapterFactory.create(settings)
            expect(adapter).toBeDefined()
            const started = await adapter.start({timeout:4000})
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
            await DirectConnectInterface.getInstance().disconnect()
            AdapterFactory.reset()
        })

        test('normal Ble Start',async ()=>{

            const binding = new Noble( defaultBinding() )
            BleInterface.getInstance({binding})
            BleMultiTransportInterfaceFactory.register('ble',BleInterfaceFactory)
        
            
            const settings = { interface: "ble", name: "Volt", protocol: "fm", address:"517b656007e9bfee936afeb90129e3f9" }
            adapter = AdapterFactory.create(settings)
            expect(adapter).toBeDefined()
            const started = await adapter.start({timeout:4000})
            expect(started).toBeTruthy()

            await adapter.pause()

            const restarted = await adapter.start({timeout:4000})
            expect(restarted).toBeTruthy()


        },80000)

    })

})