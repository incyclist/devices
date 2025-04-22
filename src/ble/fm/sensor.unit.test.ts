import EventEmitter from 'events';
import BleFitnessMachineDevice from './sensor';
import { BleCharacteristic, BleProperty } from '../types';

const OC = expect.objectContaining

const data = (input) => {
    const view = new Uint8Array(input.length / 2)

    for (let i = 0; i < input.length; i += 2) {
        view[i / 2] = parseInt(input.substring(i, i + 2), 16)
    }

    return view.buffer
}

class MockChar extends EventEmitter implements BleCharacteristic {
    uuid: string;
    properties: BleProperty[];
    _serviceUuid?: string | undefined;
    name?: string | undefined;

    constructor(uuid) {
        super()
        this.uuid = uuid
    }
    
    subscribe(callback: (err: Error | undefined) => void): void {
        throw new Error('Method not implemented.');
    }
    unsubscribe(callback: (err: Error | undefined) => void): void {
        throw new Error('Method not implemented.');
    }
    read(callback: (err: Error | undefined, data: Buffer) => void): void {
        throw new Error('Method not implemented.');
    }
    write(data: Buffer, withoutResponse: boolean, callback?: ((err: Error | undefined) => void) | undefined): void {
        throw new Error('Method not implemented.');
    }            
}
MockChar.prototype.subscribe = jest.fn()
MockChar.prototype.unsubscribe = jest.fn()
MockChar.prototype.read = jest.fn()
MockChar.prototype.write = jest.fn()




describe('BleFitnessMachineDevice',()=>{


    describe('constructor',()=>{

        test('without peripheral',()=>{
            const c = new BleFitnessMachineDevice({id:'4711'})

            // statics
            expect(c.getProfile()).toBe('Smart Trainer')
            expect(c.getProtocol()).toBe('fm')
            expect(c.getServiceUUids()).toEqual(['1826'])
            expect(c.getCrr()).toBe(0.0033)


        })
        test('with peripheral',()=>{
            // TODO
        })


    })

    describe('isMatching',()=>{

        let sensor:BleFitnessMachineDevice

        beforeEach( ()=>{
            sensor = new BleFitnessMachineDevice(null,{id:'4711'})
        })

        test('success',()=>{
            const res = sensor.isMatching(['1826'])
            expect(res).toBe(true)
        })
        test('additional services',()=>{
            const res = sensor.isMatching(['1826','1818'])
            expect(res).toBe(true)
        })
        test('missing',()=>{
            const res = sensor.isMatching(['1808','1818'])
            expect(res).toBe(false)
        })

        test('full ids',()=>{
            const res = sensor.isMatching(['00001826-0000-1000-8000-00805f9b34fb'])
            expect(res).toBe(true)
        })

    })

    


    describe('onDisconnect',()=>{})

    describe('parseHrm',()=>{})

    describe('parseIndoorBikeData',()=>{
        let ftms;

        beforeAll( ()=>{
            ftms = new BleFitnessMachineDevice({id:'test'})
        })

        test('distance,cadence,power and time',()=>{
            const res = ftms.parseIndoorBikeData( data('5408e2067e00bb00004d000000'));
            expect(res).toMatchObject( { speed:17.62,instantaneousPower:77,cadence:63,totalDistance:187, time:0 })
        })

        test('real response from Volt (',()=>{
            const res = ftms.parseIndoorBikeData( data("6402000000001400000000"));
            expect(res).toMatchObject( { speed:0,instantaneousPower:0,cadence:0,heartrate:0,resistanceLevel:20 })
        })

        test('real response from Volt/Mac (',()=>{
            const res = ftms.parseIndoorBikeData( data("6402c108000014001c0000"));
            expect(res).toMatchObject( { speed:22.41,instantaneousPower:28,cadence:0,heartrate:0,resistanceLevel:20 })
        })

        test('real response from  Rave',()=>{
            ftms.logEvent = jest.fn()
            const res = ftms.parseIndoorBikeData( data("fe1f00000000000000000000000100000000000000000000000000000000"));
            expect(res).toMatchObject( { speed:0,instantaneousPower:0,resistanceLevel:1 })
            expect(ftms.logEvent).not.toHaveBeenCalled()
        })

    })

    describe('parseFitnessMachineStatus',()=>{

        let ftms;

        beforeAll( ()=>{
            ftms = new BleFitnessMachineDevice({id:'test'})

        })

        //
        test('status 0x12 - will be ignored',()=>{
            ftms.logEvent = jest.fn()
            const res = ftms.parseFitnessMachineStatus( data("12000000002423"));
            expect(res).toEqual( {raw:'2ada:12000000002423'})
            expect(ftms.logEvent).not.toHaveBeenCalled( )
        })

        test('status 0x8 - valid notification',()=>{
            ftms.logEvent = jest.fn()
            const res = ftms.parseFitnessMachineStatus( data("086000"));
            expect(res).toEqual( {targetPower:96, raw:'2ada:086000'})
            expect(ftms.logEvent).not.toHaveBeenCalled( )
        })

        test('status 0x8 - real invalid notification received from Think XX01',()=>{
            ftms.logEvent = jest.fn()
            const res = ftms.parseFitnessMachineStatus( data("08"));
            expect(res).toMatchObject( {raw:'2ada:08'})
            expect(ftms.logEvent).toHaveBeenCalledWith( OC({message:'warning', warning:'invalid message - message too short' }) )
        })

    })
    describe('getFitnessMachineFeatures',()=>{})


})
