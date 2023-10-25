import EventEmitter from 'events';
import BleFitnessMachineDevice from './comms';
import { sleep } from '../../utils/utils';
import { BleCharacteristic } from '../types';
import { CSC_MEASUREMENT, CSP_MEASUREMENT, FTMS_CP, FTMS_STATUS, HR_MEASUREMENT, INDOOR_BIKE_DATA } from '../consts';

const data = (input) => {
    const view = new Uint8Array(input.length / 2)

    for (let i = 0; i < input.length; i += 2) {
        view[i / 2] = parseInt(input.substring(i, i + 2), 16)
    }

    return view.buffer
}

class MockChar extends EventEmitter implements BleCharacteristic {
    uuid: string;
    properties: string[];
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

        test('success',()=>{
            const res = BleFitnessMachineDevice.isMatching(['2ada','2ad9','2ad2'])
            expect(res).toBe(true)
        })
        test('no FTMS Status',()=>{
            const res = BleFitnessMachineDevice.isMatching(['2ad9','2ad2'])
            expect(res).toBe(false)

        })
        test('no Power',()=>{
            const res = BleFitnessMachineDevice.isMatching(['2ada','2ad2'])
            expect(res).toBe(false)
        })
        test('no Indoor Bike Data',()=>{
            const res = BleFitnessMachineDevice.isMatching(['2ada','2ad9'])
            expect(res).toBe(false)

        })

        test('uppercase',()=>{
            const res = BleFitnessMachineDevice.isMatching(['2ADA','2AD9','2AD2'])
            expect(res).toBe(false)
        })

    })

    describe('subscribeWriteResponse',()=>{
        let c:BleFitnessMachineDevice
        let connector
        beforeEach( ()=>{
            c = new BleFitnessMachineDevice({id:'test'})
            c.onData = jest.fn()
            connector = new EventEmitter()
            connector.isSubscribed = jest.fn()
            connector.subscribe = jest.fn()
            jest.spyOn(connector,'removeAllListeners')
            c.ble.peripheralCache.getConnector = jest.fn().mockReturnValue(connector)
        })

        afterEach( ()=>{
            jest.useRealTimers()
        })

        test('success',async ()=>{
            connector.isSubscribed.mockReturnValue(false)
            connector.subscribe = jest.fn( async uuid=> {
                await sleep(10)
                connector.emit(uuid,uuid,[1,2,3])
                connector.emit(uuid,uuid,[1,2,3])
            })

            await c.subscribeWriteResponse('2ada')
            await sleep(30)
            expect(connector.subscribe).toHaveBeenCalled()
            expect(connector.listenerCount('2ada')).toBe(1)
            expect(c.onData).toHaveBeenCalledTimes(1)
            expect(c.onData).toHaveBeenCalledWith('2ada',[1,2,3])

        })
        test('already subscribed',async ()=>{
            connector.isSubscribed.mockReturnValue(true)
            await c.subscribeWriteResponse('2ada')
            expect(connector.subscribe).not.toHaveBeenCalled()
        })
        test('failure',async ()=>{
            connector.isSubscribed.mockReturnValue(false)
            connector.subscribe.mockRejectedValue(new Error('XX'))

            await expect( async ()=>{ await c.subscribeWriteResponse('2ada') })
            .rejects.toThrow('XX')
        })

        test('message newer than 500ms will be transmitted',async ()=>{
            jest.useFakeTimers();

            connector.isSubscribed.mockReturnValue(false)
            connector.subscribe = jest.fn( async uuid=> {
                connector.emit(uuid,uuid,[1,2,3])
                setTimeout( ()=>{
                    connector.emit(uuid,uuid,[1,2,3])
                }, 600)               
            })

            await c.subscribeWriteResponse('2ada')
            jest.advanceTimersByTime(1200)           
            expect(c.onData).toHaveBeenCalledTimes(2)
        })


    })
    describe('subscribeAll',()=>{
        let c:BleFitnessMachineDevice
        let connector
        beforeEach( ()=>{
            c = new BleFitnessMachineDevice({id:'test'})
            c.onData = jest.fn()
            connector = new EventEmitter()
            connector.isSubscribed = jest.fn()
            connector.subscribe = jest.fn()
            jest.spyOn(connector,'removeAllListeners')
            c.ble.peripheralCache.getConnector = jest.fn().mockReturnValue(connector)

            c.characteristics = []
            c.characteristics.push( new MockChar(FTMS_STATUS))
            c.characteristics.push( new MockChar(INDOOR_BIKE_DATA))
            c.characteristics.push( new MockChar(FTMS_CP))
            c.characteristics.push( new MockChar(CSC_MEASUREMENT))
            c.characteristics.push( new MockChar(CSP_MEASUREMENT))
            c.characteristics.push( new MockChar(HR_MEASUREMENT))
        })

        test('features unknown',async ()=>{
            connector.subscribe.mockResolvedValue(true)            
            await c.subscribeAll()

            expect(c.subscribedCharacteristics.length).toBe(6)
            expect(c.subscribedCharacteristics).toContain(FTMS_STATUS)
            expect(c.subscribedCharacteristics).toContain(INDOOR_BIKE_DATA)
            expect(c.subscribedCharacteristics).toContain(FTMS_CP)
            expect(c.subscribedCharacteristics).toContain(CSC_MEASUREMENT)
            expect(c.subscribedCharacteristics).toContain(CSP_MEASUREMENT)
            expect(c.subscribedCharacteristics).toContain(HR_MEASUREMENT)           
        })

        test('no additional services',async ()=>{
            c.features = { fitnessMachine:1, targetSettings:1}
            connector.subscribe.mockResolvedValue(true)            
            await c.subscribeAll()

            expect(c.subscribedCharacteristics.length).toBe(3)
            expect(c.subscribedCharacteristics).toContain(FTMS_STATUS)
            expect(c.subscribedCharacteristics).toContain(INDOOR_BIKE_DATA)
            expect(c.subscribedCharacteristics).toContain(FTMS_CP)
        })


        test('with CSC',async ()=>{
            c.features = { fitnessMachine:1, targetSettings:1, cadence:true}
            connector.subscribe.mockResolvedValue(true)            
            await c.subscribeAll()

            expect(c.subscribedCharacteristics.length).toBe(4)
            expect(c.subscribedCharacteristics).toContain(FTMS_STATUS)
            expect(c.subscribedCharacteristics).toContain(INDOOR_BIKE_DATA)
            expect(c.subscribedCharacteristics).toContain(FTMS_CP)
            expect(c.subscribedCharacteristics).toContain(CSC_MEASUREMENT)
            
        })
        test('with CSP',async ()=>{
            c.features = { fitnessMachine:1, targetSettings:1, power:true}
            connector.subscribe.mockResolvedValue(true)            
            await c.subscribeAll()

            expect(c.subscribedCharacteristics.length).toBe(4)
            expect(c.subscribedCharacteristics).toContain(FTMS_STATUS)
            expect(c.subscribedCharacteristics).toContain(INDOOR_BIKE_DATA)
            expect(c.subscribedCharacteristics).toContain(FTMS_CP)
            expect(c.subscribedCharacteristics).toContain(CSP_MEASUREMENT)
            
        })
        test('with HR',async()=>{
            c.features = { fitnessMachine:1, targetSettings:1, heartrate:true}
            connector.subscribe.mockResolvedValue(true)            
            await c.subscribeAll()

            expect(c.subscribedCharacteristics.length).toBe(4)
            expect(c.subscribedCharacteristics).toContain(FTMS_STATUS)
            expect(c.subscribedCharacteristics).toContain(INDOOR_BIKE_DATA)
            expect(c.subscribedCharacteristics).toContain(FTMS_CP)
            expect(c.subscribedCharacteristics).toContain(HR_MEASUREMENT)
            
        })

        test('with connector',async ()=>{
            connector.subscribe.mockResolvedValue(true)            
            await c.subscribeAll(connector)
            expect(c.subscribedCharacteristics.length).toBe(6)
        })

        test('single subscription fails. does not throw, just skips',async ()=>{
            connector.subscribe = jest.fn( async (uuid)=> {
                if (uuid===FTMS_CP)
                    throw new Error('XX')
            })
            await c.subscribeAll()

            expect(c.subscribedCharacteristics.length).toBe(5)
            expect(c.subscribedCharacteristics).toContain(FTMS_STATUS)
            expect(c.subscribedCharacteristics).toContain(INDOOR_BIKE_DATA)
            expect(c.subscribedCharacteristics).not.toContain(FTMS_CP)
            expect(c.subscribedCharacteristics).toContain(CSC_MEASUREMENT)
            expect(c.subscribedCharacteristics).toContain(CSP_MEASUREMENT)
            expect(c.subscribedCharacteristics).toContain(HR_MEASUREMENT)           
        })


    })
    describe('init',()=>{
        let c:BleFitnessMachineDevice
        beforeEach( ()=>{
            c = new BleFitnessMachineDevice({id:'test'})
            c.onData = jest.fn()            
            c.getDeviceInfo=jest.fn().mockResolvedValue({manufacurer:'test',model:'alpha'})
            c.getFitnessMachineFeatures=jest.fn().mockResolvedValue({ fitnessMachine:1, targetSettings:1, power:true, cadence:true})
            jest.spyOn(c,'emit')
        })

        test('success',async ()=>{
            const res = await c.init()
            expect(res).toBe(true)
            expect(c.isInitialized).toBe(true)
            expect(c.emit).toHaveBeenCalledWith('deviceInfo',{manufacurer:'test',model:'alpha'})
        })

        test('errors during getFitnessMachineFeatures',async ()=>{
            c.getFitnessMachineFeatures= jest.fn().mockResolvedValue(undefined)

            const res = await c.init()
            expect(res).toBe(true)
            expect(c.isInitialized).toBe(true)
            expect(c.emit).toHaveBeenCalledWith('deviceInfo',{manufacurer:'test',model:'alpha'})
            // c.features will still be undefined
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
        
    })

    describe('parseFitnessMachineStatus',()=>{})
    describe('getFitnessMachineFeatures',()=>{})


})
