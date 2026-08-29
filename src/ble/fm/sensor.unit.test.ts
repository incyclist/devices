import { EventEmitter } from 'events';
import BleFitnessMachineDevice from './sensor';
import { BleCharacteristic, BleProperty } from '../types';


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

    


    // FIXES_BACKLOG #25: writeFtmsMessage()'s dedicated per-write timeout must genuinely cancel the
    // underlying write() call it wraps, instead of abandoning it to keep running - and holding its
    // 'data' listener on the shared characteristic - on its own (much longer, or non-existent) timeline.
    describe('writeFtmsMessage / requestControl cancellation (FIXES_BACKLOG #25)',()=>{

        let ftms:any

        beforeEach( ()=>{
            ftms = new BleFitnessMachineDevice(null,{id:'test'})
            ftms.logEvent = jest.fn()
            ftms.isSubscribed = jest.fn().mockReturnValue(true)
        })

        test('a dedicated write timeout aborts the underlying write() call, and resolves to OperationFailed (0x04)',async ()=>{
            let capturedSignal: AbortSignal|undefined
            ftms.write = jest.fn().mockImplementation( (_uuid:string,_data:Buffer,options:any) => {
                capturedSignal = options?.signal
                return new Promise<Buffer>( ()=>{} )   // never settles on its own - simulates a stuck GATT write
            })

            const data = Buffer.alloc(1)
            const result = await ftms.writeFtmsMessage(0x00, data, {timeout:20})

            expect(result).toBe(0x04)   // OpCodeResut.OperationFailed
            expect(capturedSignal).toBeInstanceOf(AbortSignal)
            expect(capturedSignal!.aborted).toBe(true)
        })

        test('an externally supplied signal (e.g. from establishControl()) also aborts the underlying write(), independent of the internal timeout',async ()=>{
            let capturedSignal: AbortSignal|undefined
            // mimics the real BlePeripheral.write(), which reacts to `options.signal` itself and
            // rejects once it fires - here we only need to verify writeFtmsMessage() correctly
            // forwards (merges) the externally supplied signal down into the call, not re-test
            // write()'s own abort handling (already covered in peripheral.unit.test.ts)
            ftms.write = jest.fn().mockImplementation( (_uuid:string,_data:Buffer,options:any) => {
                capturedSignal = options?.signal
                return new Promise<Buffer>( (_resolve,reject) => {
                    options?.signal?.addEventListener('abort', ()=>reject(new Error('aborted')), {once:true})
                })
            })

            const external = new AbortController()
            const data = Buffer.alloc(1)
            const promise = ftms.writeFtmsMessage(0x00, data, {timeout:5000, signal:external.signal})

            external.abort()

            const result = await promise
            expect(result).toBe(0x04)   // OpCodeResut.OperationFailed
            expect(capturedSignal?.aborted).toBe(true)
        })

        // FIXES_BACKLOG (follow-up to #25): AbortSignal.any() is not implemented on React Native's
        // Hermes engine - confirmed via real-device (mobile) testing, where it threw
        // "AbortSignal.any is not a function" synchronously, before the underlying write() was ever
        // even invoked. Merging the externally-supplied and internal timeout signals must not depend
        // on that static method.
        test('merges an externally supplied signal with the internal timeout signal without using AbortSignal.any()',async ()=>{
            const originalAny = AbortSignal.any
            // @ts-expect-error - simulate a JS engine (e.g. Hermes/React Native) that doesn't implement
            // the static AbortSignal.any() method at all
            delete AbortSignal.any

            try {
                let capturedSignal: AbortSignal|undefined
                ftms.write = jest.fn().mockImplementation( (_uuid:string,_data:Buffer,options:any) => {
                    capturedSignal = options?.signal
                    return new Promise<Buffer>( (_resolve,reject) => {
                        options?.signal?.addEventListener('abort', ()=>reject(new Error('aborted')), {once:true})
                    })
                })

                const external = new AbortController()
                const data = Buffer.alloc(1)
                const promise = ftms.writeFtmsMessage(0x00, data, {timeout:5000, signal:external.signal})

                external.abort()

                const result = await promise
                expect(result).toBe(0x04)   // OpCodeResut.OperationFailed
                expect(capturedSignal?.aborted).toBe(true)
            }
            finally {
                AbortSignal.any = originalAny
            }
        })

        test('requestControl() forwards an external cancellation signal down to the underlying write()',async ()=>{
            let capturedSignal: AbortSignal|undefined
            ftms.write = jest.fn().mockImplementation( (_uuid:string,_data:Buffer,options:any) => {
                capturedSignal = options?.signal
                return new Promise<Buffer>( (_resolve,reject) => {
                    options?.signal?.addEventListener('abort', ()=>reject(new Error('aborted')), {once:true})
                })
            })

            const external = new AbortController()
            const promise = ftms.requestControl(external.signal)

            external.abort()

            const hasControl = await promise
            expect(hasControl).toBe(false)
            expect(capturedSignal?.aborted).toBe(true)
        })

        test('setTargetPower() still resolves normally - unaffected by the listener-cleanup/cancellation changes',async ()=>{
            ftms.hasControl = true   // control already granted -> requestControl() short-circuits to true
            ftms.write = jest.fn().mockImplementation( (_uuid:string,_data:Buffer,_options:any) => {
                const res = Buffer.alloc(3)
                res.writeUInt8(0x80,0)          // ResponseCode
                res.writeUInt8(0x05,1)          // request: SetTargetPower
                res.writeUInt8(0x01,2)          // result: Success
                return Promise.resolve(res)
            })

            const result = await ftms.setTargetPower(150)

            expect(result).toBe(true)
        })

        test('startRequest() still resolves normally - unaffected by the listener-cleanup/cancellation changes',async ()=>{
            ftms.hasControl = true
            ftms.write = jest.fn().mockImplementation( (_uuid:string,_data:Buffer,_options:any) => {
                const res = Buffer.alloc(3)
                res.writeUInt8(0x80,0)          // ResponseCode
                res.writeUInt8(0x07,1)          // request: StartOrResume
                res.writeUInt8(0x01,2)          // result: Success
                return Promise.resolve(res)
            })

            const result = await ftms.startRequest()

            expect(result).toBe(true)
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

        describe('flags declare more fields than the packet contains (FS-2FC6E8 production log)',()=>{
            let truncated;

            beforeEach( ()=>{
                truncated = new BleFitnessMachineDevice({id:'test', getInfo: jest.fn().mockReturnValue({name:'FS-2FC6E8'})})
                truncated.logEvent = jest.fn()
            })

            test('does not throw and parses the fields that fit',()=>{
                const res = truncated.parseIndoorBikeData( data("740b000000000000006400000000000000004800"));
                expect(res).toMatchObject( { cadence:0, totalDistance:0, resistanceLevel:100, instantaneousPower:0, heartrate:72 })
                expect(res.time).toBeUndefined()
            })

            test('logs the truncation once with the raw data',()=>{
                truncated.parseIndoorBikeData( data("740b000000000000006400000000000000004800"));
                expect(truncated.logEvent).toHaveBeenCalledTimes(1)
                expect(truncated.logEvent).toHaveBeenCalledWith( expect.objectContaining({
                    message:'error', fn:'parseIndoorBikeData()', data:'740b000000000000006400000000000000004800'
                }))
            })

            test('does not log again for subsequent notifications in the same session',()=>{
                truncated.parseIndoorBikeData( data("740b000000000000006400000000000000004800"));
                truncated.parseIndoorBikeData( data("740b000000000000006400000000000000004800"));
                truncated.parseIndoorBikeData( data("740b000000000000006400000000000000004800"));
                expect(truncated.logEvent).toHaveBeenCalledTimes(1)
            })
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
            expect(ftms.logEvent).toHaveBeenCalledWith( expect.objectContaining({message:'warning', warning:'invalid message - message too short' }) )
        })

    })
    describe('getFitnessMachineFeatures',()=>{
        let ftms: BleFitnessMachineDevice
        

        const setupMock = (s:any, data?:Buffer|string) => {
            if (!data) {
                s.read = jest.fn().mockResolvedValue(undefined)
                

            }
            else {
                const _data = typeof data ==='string' ?  Buffer.from(data,'hex' ) : Buffer.from(data)
                s.read = jest.fn().mockResolvedValue(_data)
            }

        }

        beforeEach( ()=>{
            ftms = new BleFitnessMachineDevice({id:'test', getInfo: jest.fn().mockResolvedValue({name:'test'})})
            
        })

        afterEach( ()=> {
            jest.resetAllMocks()
        })

        test('valid FitnessMachineFeatures',async ()=>{

            const b = Buffer.alloc(8)
            b.writeUint16LE(16387,0)
            b.writeUint16LE(24588,4)

            setupMock(ftms,b)
            const res = await ftms.getFitnessMachineFeatures()
            expect(res).toMatchObject({fitnessMachine:16387,targetSettings:24588,power:true,heartrate:false,cadence:true,setPower:true,setSlope:true})

        })

        test('no data',async ()=>{
            setupMock(ftms,undefined)
            const res = await ftms.getFitnessMachineFeatures()
            expect(res).toMatchObject({power:false,heartrate:false})


        })
        test('empty data',async ()=>{
            setupMock(ftms,'')
            const res = await ftms.getFitnessMachineFeatures()
            expect(res).toMatchObject({power:false,heartrate:false})

        })


    })


})
