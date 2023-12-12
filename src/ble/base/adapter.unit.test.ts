import { LegacyProfile } from '../../antv2/types'
import BleFmAdapter from '../fm/adapter'
import { BleDeviceSettings } from '../types'
import BleAdapter from './adapter'
import { BleComms } from './comms'
import { BleDeviceData } from './types'

class TestAdapter extends BleAdapter<BleDeviceData, BleComms> {
    protected static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Power Meter'

}

describe('Ble Adapter',()=>{


    describe('constructor',()=>{
        test('no adress',()=>{
            const a  = new TestAdapter({interface:'ble', name:'EEE', protocol:'fm'})
            expect(a.getName()).toBe('EEE')
            expect(a.getDisplayName()).toBe('EEE')
            expect(a.getUniqueName()).toBe('EEE')
            expect(a.getInterface()).toBe('ble')
            expect(a.getProtocolName()).toBe('fm')     
            expect(a.getProfile()).toBe('Power Meter') // as configured in the static property
            expect(a.getID()).toBeUndefined()
        })

        test('with address',()=>{
            const a  = new TestAdapter({interface:'ble', name:'EEE', protocol:'fm', address:'00 11 22 33 44 55'})
            expect(a.getName()).toBe('EEE')
            expect(a.getUniqueName()).toBe('EEE 0055') // first and last byte
        })

        test('no name',()=>{
            const a  = new TestAdapter({interface:'ble', id:'AAA', protocol:'fm'})
            expect(a.getName()).toBe('AAA')
            expect(a.getUniqueName()).toBe('AAA')
            expect(a.getID()).toBe('AAA')

            const b  = new TestAdapter({interface:'ble', id:'AAA', protocol:'fm', address:'00 11 22 33 44 55'})
            expect(b.getName()).toBe('AAA')
            expect(b.getUniqueName()).toBe('AAA 0055')
            expect(b.getID()).toBe('AAA')

        })

        test('incorrect interface',()=>{

            const settings:BleDeviceSettings = {interface:'ant', name:'1', protocol:'fm'}
            expect( ()=>{const a  = new TestAdapter(settings)})
                .toThrow('Incorrect interface')

        })

    })

    describe('isEqual',()=>{
        test('name only equal',()=>{
            const A = new BleFmAdapter({interface:'ble', name:'1', protocol:'fm'})
            const res = A.isEqual({interface:'ble', name:'1', protocol:'fm'})
            expect(res).toBeTruthy()
        }) 
        test('only name not equal',()=>{
            const A = new BleFmAdapter({interface:'ble', name:'1', protocol:'fm'})
            const res = A.isEqual({interface:'ble', name:'2', protocol:'fm'})
            expect(res).toBeFalsy()
        }) 
        test('name and address - one is equal',()=>{
            const A = new BleFmAdapter({interface:'ble', name:'1',address:'1111', protocol:'fm'})
            const res = A.isEqual({interface:'ble', name:'2',address:'1111', protocol:'fm'})
            expect(res).toBeTruthy()
        }) 
    
    })    

    describe('connect',()=>{
        let adapter:TestAdapter
        let device
        beforeEach( ()=>{
            device = { connect:jest.fn()}
            adapter = new TestAdapter({protocol: 'fm',interface: 'ble', name:'Test'});
            adapter.isConnected = jest.fn().mockReturnValue(false);
            (adapter as any).device = device            

        })


        test('success',async ()=>{
            device.connect = jest.fn().mockResolvedValue(true)
            const res = await adapter.connect()
            expect(res).toBe(true)
        })
        test('failure',async ()=>{
            device.connect = jest.fn().mockResolvedValue(false)
            const res = await adapter.connect()
            expect(res).toBe(false)
        })

        test('already connected',async ()=>{
            adapter.isConnected = jest.fn().mockReturnValue(true)
            device.connect = jest.fn().mockResolvedValue(true)
            const res = await adapter.connect()
            expect(res).toBe(true)
            expect(device.connect).not.toHaveBeenCalled()
        })

        test('connect throws error',async ()=>{
            device.connect = jest.fn().mockRejectedValue(new Error('X'))
            const res = await adapter.connect()
            expect(res).toBe(false)
        })

        // iface.connect is not expected to throw
    })


    describe('close',()=>{
        let adapter:TestAdapter
        let device
        beforeEach( ()=>{
            device = { disconnect:jest.fn()}
            adapter = new TestAdapter({protocol: 'fm',interface: 'ble', name:'Test'});
            adapter.isConnected = jest.fn().mockReturnValue(true);
            (adapter as any).device = device            

        })


        test('success',async ()=>{
            device.disconnect = jest.fn().mockResolvedValue(true)
            const res = await adapter.close()
            expect(res).toBe(true)
        })
        test('failure',async ()=>{
            device.disconnect = jest.fn().mockResolvedValue(false)
            const res = await adapter.close()
            expect(res).toBe(false)
        })

        test('already closed',async ()=>{
            adapter.isConnected = jest.fn().mockReturnValue(false)
            device.disconnect = jest.fn().mockResolvedValue(true)
            const res = await adapter.close()
            expect(res).toBe(true)
            expect(device.disconnect).not.toHaveBeenCalled()
        })

        // iface.connect is not expected to throw
    })

})