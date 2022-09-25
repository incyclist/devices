import BleInterface from './ble-interface'
import {MockLogger} from '../../test/logger'
import { BleDevice } from './ble-device'

class A extends BleDevice {
    static services:string[];
    getProfile(): string {return 'mock'}
    getServiceUUids(): string[] {return this.services }
    static setServices( services:string[]) {this.services = services}
}

class B extends BleDevice {
    static services:string[];
    getProfile(): string {return 'mock'}
    getServiceUUids(): string[] {return this.services }
    static setServices( services:string[]) {this.services = services}
}

describe('BleInterface',()=>{

    describe('getDevicesFromServices',()=>{

        describe('string',()=>{

            test('uuids are equal',()=>{
                const ble = new BleInterface( {logger:MockLogger})
                A.setServices(['1234','1235','abcd'])
                B.setServices(['1234','abcd'])
                const res = ble.getDevicesFromServices([A,B],'1235')
                expect(res).toEqual([A])
            })

        })

        describe('array',()=>{
            test('uuids are equal',()=>{
                const ble = new BleInterface( {logger:MockLogger})
                A.setServices(['1234','1235','abcd'])
                B.setServices(['1234','abcd','4567'])
                const res1 = ble.getDevicesFromServices([A,B],['1235','xyz'])
                expect(res1).toEqual([A])
                const res2 = ble.getDevicesFromServices([A,B],['4567','xyz'])
                expect(res2).toEqual([B])
                const res3 = ble.getDevicesFromServices([A,B],['1234','xyz','4567'])
                expect(res3).toEqual([A,B])
            })
            
        })

    })

})