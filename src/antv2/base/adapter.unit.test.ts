import AntAdapter from './adapter'
import { AntDeviceSettings, BaseDeviceData, LegacyProfile } from '../types';
import { Profile } from 'incyclist-ant-plus';
import { sleep } from '../../utils/utils';
import AntInterface from './interface';
import MockAdapter from '../../../test/mock-adapter';
import { IncyclistCapability } from '../../types';

class TestAdapter extends AntAdapter<BaseDeviceData> {
    static INCYCLIST_PROFILE_NAME:LegacyProfile = 'Heartrate Monitor'
    static ANT_PROFILE_NAME:Profile = 'HR'        
}

describe( 'adapter', ()=>{
    let cs ;
    beforeAll( ()=>{
        cs = AntAdapter.prototype.createSensor
        AntAdapter.prototype.createSensor = jest.fn()
    })

    afterAll( ()=> {
        AntAdapter.prototype.createSensor = cs
    })

    describe('constructor',()=>{

        test('typical settings, empty props',()=>{
            const settings = {       
                name: 'XXXX',
                selected: true,
                protocol: 'Ant',
                deviceID: '2606',
                profile: 'Heartrate Monitor',
                interface: 'ant'
            } as AntDeviceSettings
            const adapter = new TestAdapter(settings,{})

            // simple getters
            expect(adapter.isStarted()).toBeFalsy()
            expect(adapter.isStopped()).toBeFalsy()
            expect(adapter.isPaused()).toBeFalsy()
            expect(adapter.getInterface()).toBe('ant')

        })

        test('incorrect interface',()=>{
            const settings = {       
                deviceID: '2606',
                profile: 'Heartrate Monitor',
                interface: 'ble'
            } as AntDeviceSettings

            let adapter,error;
            try {
                adapter = new TestAdapter(settings,{})
            }
            catch(err) {
                error = err;
            }
            expect(adapter).toBeUndefined()
            expect(error).toBeDefined()


        })

    })


    describe('isEqual',()=>{
        let adapter:TestAdapter
        beforeEach( ()=>{
            adapter = new TestAdapter({deviceID: '2606',profile: 'HR',interface: 'ant', name:'Horst'})
        })
        
        test('equal',()=>{
            expect(adapter.isEqual({deviceID: '2606',profile: 'HR',interface: 'ant'})).toBe(true)
        })
        test('different name (is ignored)',()=>{
            expect(adapter.isEqual({deviceID: '2606',profile: 'HR',interface: 'ant',name:'123'})).toBe(true)
        })
        test('legacy',()=>{
            expect(adapter.isEqual({deviceID: '2606',profile: 'Heartrate Monitor',interface: 'ant',protocol:'ANT'})).toBe(false)
        })

        test('different deviceID',()=>{
            expect(adapter.isEqual({deviceID: '4711',profile: 'HR',interface: 'ant'})).toBe(false)
        })
        test('different profile',()=>{
            expect(adapter.isEqual({deviceID: '2606',profile: 'PWR',interface: 'ant'})).toBe(false)

        })
        test('different interface',()=>{
            expect(adapter.isEqual({deviceID: '2606',profile: 'HR',interface: 'ble'})).toBe(false)

        })

    })

    describe('connect',()=>{
        let adapter:TestAdapter
        let iface:AntInterface
        beforeEach( ()=>{
            (AntInterface._instance as any)= undefined
            adapter = new TestAdapter({deviceID: '2606',profile: 'HR',interface: 'ant', name:'Horst'})
            iface = AntInterface.getInstance()
        })


        test('success',async ()=>{
            iface.connect = jest.fn().mockResolvedValue(true)
            const res = await adapter.connect()
            expect(res).toBe(true)
        })
        test('failure',async ()=>{
            iface.connect = jest.fn().mockResolvedValue(false)
            const res = await adapter.connect()
            expect(res).toBe(false)

        })

        // iface.connect is not expected to throw
    })

    describe('resetData',()=>{
        let adapter:TestAdapter
        beforeEach( ()=>{
            adapter = new TestAdapter({deviceID: '2606',profile: 'HR',interface: 'ant', name:'Horst'})
            adapter.deviceData = {DeviceID:2606,ManId:32}
        })

        test('resetData',async ()=>{
            
            await adapter.resetData()
            
            expect(adapter.hasData()).toBe(false)
            expect(adapter.deviceData).toEqual({DeviceID:2606})
            expect(adapter.data).toEqual({})
            
        })
    })

    describe('isSame',()=>{
        let adapter:TestAdapter
        beforeEach( ()=>{
            adapter = new TestAdapter({deviceID: '2606',profile: 'HR',interface: 'ant', name:'Horst'})
            adapter.deviceData = {DeviceID:2606,ManId:32}
        })

        test('same', ()=>{
            const b = new TestAdapter({deviceID: '2606',profile: 'HR',interface: 'ant'})
            expect(adapter.isSame(b)).toBe(true)            
        })

        test('not an AntAdapter', ()=>{
            const b = new MockAdapter()
            expect(adapter.isSame(b)).toBe(false)            
        })

    })
    describe('udpateData',()=>{

    })

    describe('check',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new TestAdapter({deviceID: '2606',profile: 'HR',interface: 'ant'})
            adapter.start = jest.fn()
        })

        test('start ok',async ()=>{
            adapter.start.mockResolvedValue(new Error('could not start device, reason:timeout'))
            const res = await adapter.check()
            expect(res).toBeTruthy()

        })

        test('start fails',async ()=>{
            adapter.start.mockRejectedValue(true)
            const res = await adapter.check()
            expect(res).toBeFalsy()
        })

        
    })
    describe('isWaitingForData',()=>{
        let a:AntAdapter<BaseDeviceData>

        beforeEach( ()=>{
            a = new TestAdapter({deviceID: '2606',profile: 'HR',interface: 'ant'})       
            a._wait = jest.fn().mockResolvedValue(true)
            jest.useFakeTimers()            
        })

        test('not waiting',()=>{
            expect(a.isWaitingForData()).toBe(false)
        })

        test('waiting',()=>{
            a.waitForData(1000)
            expect(a.isWaitingForData()).toBe(true)
        })

        test('waiting finished',async()=>{

            jest.useRealTimers()
            const promise = a.waitForData(100)
            expect(a.isWaitingForData()).toBe(true)

            await promise
            expect(a.isWaitingForData()).toBe(false)

        })

        afterEach( ()=>{
            jest.useRealTimers()
        })
    })

    describe('waitForData',()=>{
        let a:AntAdapter<BaseDeviceData>

        beforeEach( ()=>{
            a = new TestAdapter({deviceID: '2606',profile: 'HR',interface: 'ant'})            
            jest.useRealTimers()
            jest.spyOn(a,'_wait')
        })
        

        test('received Data',async ()=>{
            a.hasData =jest.fn().mockReturnValueOnce(false).mockReturnValue(true)

            const res = await a.waitForData(100)
            expect(a._wait).toHaveBeenCalled()
            expect(res).toBe(true)
            
        })
        test('already had Data',async ()=>{
            a.hasData =jest.fn().mockReturnValue(true)

            const res = await a.waitForData(100)
            expect(res).toBe(true)
            expect(a._wait).not.toHaveBeenCalled()

        })

        test('no Data',async ()=>{
            a.hasData =jest.fn().mockReturnValue(false)

            const res = await a.waitForData(100)
            expect(res).toBe(false)

        })

        test('parallel calls - timeout 2 is bigger than timeout 1',async ()=>{
            const tsStart = Date.now()
            a.hasData =jest.fn( ()=> Date.now()-tsStart>250 )


            const res1 = a.waitForData(100)
            await sleep(10)
            const res2 = a.waitForData(500)

            const res = await Promise.allSettled( [res1,res2])

            expect(res[0]).toEqual({status:'fulfilled', value:false})
            expect(res[1]).toEqual({status:'fulfilled', value:true})
           
            expect(a._wait).toHaveBeenCalledTimes(2)
        })


        test('parallel calls - timeout 2 is smaller than timeout 1',async ()=>{
            const tsStart = Date.now()
            a.hasData =jest.fn( ()=> {
                if (Date.now()-tsStart>200)
                    return true
                return false
            })


            const res1 = a.waitForData(800)
            await sleep(10)
            const res2 = a.waitForData(100)

            const res = await Promise.allSettled( [res1,res2])

            expect(res[0]).toEqual({status:'fulfilled', value:true})            
            expect(res[1]).toEqual({status:'fulfilled', value:true}) 
           
            expect(a._wait).toHaveBeenCalledTimes(1)
        })


    })

    describe('sendUpdate',()=>{
        let a:AntAdapter<BaseDeviceData>

        beforeEach( ()=>{
            a = new TestAdapter({deviceID: '2606',profile: 'HR',interface: 'ant'})            
            a.isControllable = jest.fn().mockReturnValue(true)
            jest.spyOn(a,'hasCapability')
            a.getCyclingMode = jest.fn().mockReturnValue({sendBikeUpdate: jest.fn()})
        })

        test('default -- needs to be implemented by subclass',()=>{
            a.capabilities=[IncyclistCapability.Control]
            expect( ()=>{ a.sendUpdate({slope:0}) } )
            .toThrow('method not implemented')

        })

        test('not controllable',()=>{
            a.isControllable = jest.fn().mockReturnValue(false)
            a.sendUpdate({slope:0})
            expect(a.getCyclingMode().sendBikeUpdate).not.toHaveBeenCalled()
        })

        test('does not have Control capabilty',()=>{
            a.capabilities=[IncyclistCapability.HeartRate]
            a.sendUpdate({slope:0})
            expect(a.getCyclingMode().sendBikeUpdate).toHaveBeenCalledWith({slope:0})
            
        })

        test('paused',()=>{
            a.paused = true
            a.sendUpdate({slope:0})
            expect(a.getCyclingMode().sendBikeUpdate).not.toHaveBeenCalled()
            
        })

        test('stopped',()=>{
            a.stopped = true
            a.sendUpdate({slope:0})
            expect(a.getCyclingMode().sendBikeUpdate).not.toHaveBeenCalled()
            
        })

    })


    describe('start',()=>{
        let adapter;
        beforeEach( ()=>{            
            adapter = new TestAdapter({deviceID: '2606',profile: 'HR',interface: 'ant'})

            adapter.emitData = jest.fn()
            adapter.emit = jest.fn()
            adapter.stop = jest.fn()
            adapter.resetData = jest.fn()

            adapter.connect=jest.fn().mockResolvedValue(true)
            adapter.startSensor=jest.fn().mockResolvedValue(true)
            adapter.waitForData=jest.fn().mockResolvedValue(true)
            adapter.getDefaultReconnectDelay = jest.fn().mockReturnValue(1)

            
        })


        test('normal start',async ()=>{
            const started = await adapter.start()         
            expect(adapter.started).toBeTruthy()   
            expect(started).toBeTruthy()   
        })

        test('already started',async ()=>{            
            adapter.started = true;

            const started = await adapter.start()         
            expect(adapter.started).toBeTruthy()   
            expect(started).toBeTruthy()   
            expect(adapter.startSensor).not.toHaveBeenCalled()
        })

        test('connect fails',async ()=>{
            adapter.connect.mockResolvedValue(false)
            let error;
            try {
                await adapter.start()         
            }
            catch(err) { error=err} 
            expect(error).toBeDefined()  
            expect(error.message).toBe('could not start device, reason:could not connect')
            expect(adapter.started).toBeFalsy()   
        })

        test('start timeout',async ()=>{
            adapter.startSensor = jest.fn( async()=> { await sleep(500); return true})
            
            let error;
            try {
                await adapter.start({startupTimeout:100})         
            }
            catch(err) { error=err} 
            expect(error).toBeDefined()  
            expect(error.message).toBe('could not start device, reason:timeout')
            expect(adapter.started).toBeFalsy()   
        })

        test('start sensor fails once',async ()=>{
            adapter.startSensor = jest.fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true)
            
            let error;
            try {
                await adapter.start({startupTimeout:100})         
            }
            catch(err) { error=err} 
            expect(error).toBeUndefined()              
            expect(adapter.started).toBeTruthy()   
        })

    })
 
    describe('stop',()=>{
        
    })

})  