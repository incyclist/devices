import { BleHrmAdapter } from "."

describe('BLE Hr Adapter',()=>{

    describe('constructor',()=>{

        test('statics',()=>{
            const a = new BleHrmAdapter({interface:'ble', protocol:'hr',name:'HRM-Mock',address:'44:0d:ec:12:40:61'})

            expect(a.getProfile()).toBe('Heartrate Monitor')
            expect(a.getName()).toBe('HRM-Mock')
            expect(a.getUniqueName()).toBe('HRM-Mock 4461')   
        })
    })


})