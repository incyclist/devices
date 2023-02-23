import BleInterface from './ble-interface'
import {MockLogger} from '../../test/logger'
import { BleComms } from './base/comms';
import { BleCommsConnectProps, BleDeviceInfo } from './types';
import { getDevicesFromServices } from './base/comms-utils';

class A extends BleComms {
    connect(props?: BleCommsConnectProps): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    disconnect(): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    getDeviceInfo(): Promise<BleDeviceInfo> {
        throw new Error('Method not implemented.');
    }
    getServices(): string[] {
        throw new Error('Method not implemented.');
    }
    static services:string[];
    getServiceUUids(): string[] {return A.services }
    static setServices( services:string[]) {A.services = services}
}

class B extends BleComms {
    connect(props?: BleCommsConnectProps): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    disconnect(): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    getDeviceInfo(): Promise<BleDeviceInfo> {
        throw new Error('Method not implemented.');
    }
    getServices(): string[] {
        throw new Error('Method not implemented.');
    }
    static services:string[];
    getServiceUUids(): string[] {return B.services }
    static setServices( services:string[]) {B.services = services}
}

describe('BleInterface',()=>{

    describe('getDevicesFromServices',()=>{

        describe('string',()=>{

            test('uuids are equal',()=>{
                const ble = new BleInterface( {logger:MockLogger})
                A.setServices(['1234','1235','abcd'])
                B.setServices(['1234','abcd'])
                const res = getDevicesFromServices([A,B],'1235')
                expect(res).toEqual([A])
            })

        })

        describe('array',()=>{
            test('uuids are equal',()=>{
                const ble = new BleInterface( {logger:MockLogger})
                A.setServices(['1234','1235','abcd'])
                B.setServices(['1234','abcd','4567'])
                const res1 = getDevicesFromServices([A,B],['1235','xyz'])
                expect(res1).toEqual([A])
                const res2 = getDevicesFromServices([A,B],['4567','xyz'])
                expect(res2).toEqual([B])
                const res3 = getDevicesFromServices([A,B],['1234','xyz','4567'])
                expect(res3).toEqual([A,B])
            })
            
        })

    })

})