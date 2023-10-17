import { EventLogger } from "gd-eventlog"
import AntDeviceBinding from "./binding"
import AntInterface from "./interface"
import { sleep } from "../../utils/utils"
import EventEmitter from "events"
import { Channel, FitnessEquipmentSensor } from "incyclist-ant-plus"

class MockBinding extends AntDeviceBinding {
    
}

describe('Ant Interface',()=>{

    describe('constructor',()=>{

        test('with binding',()=>{
            const i = new AntInterface({binding:MockBinding})

            expect(i.getName()).toBe('ant')
            expect(i.getBinding()).toBe(MockBinding)
            expect(i.isConnected()).toBe(false)
            expect( (i as any).props).toEqual({binding:MockBinding})
            expect(i.getLogger().getName()).toBe('Ant+')
            
        })

        test('just with timeout',()=>{
            const i = new AntInterface({startupTimeout:1000})

            expect(i.getName()).toBe('ant')
            expect(i.getBinding()).toBeUndefined()
            expect(i.isConnected()).toBe(false)
            expect( (i as any).props).toEqual({startupTimeout:1000})
            expect(i.getLogger().getName()).toBe('Ant+')
        })
        test('empty props',()=>{
            const i = new AntInterface({})

            expect(i.getName()).toBe('ant')
            expect(i.getBinding()).toBeUndefined()
            expect(i.isConnected()).toBe(false)
            expect( (i as any).props).toEqual({})
            expect(i.getLogger().getName()).toBe('Ant+')
        })

        test('with logger',()=>{
            const logger = new EventLogger('Test')
            const i = new AntInterface({logger})

            expect(i.getName()).toBe('ant')
            expect(i.getBinding()).toBeUndefined()
            expect(i.isConnected()).toBe(false)
            expect( (i as any).props).toEqual({logger})
            expect(i.getLogger().getName()).toBe('Test')

        })

        test('with log',()=>{
            // TODO

        })


    })

    describe('logEvent',()=>{

        let i:AntInterface,_console,_env,logger
        beforeEach( ()=>{
            logger = new EventLogger('Test')

            i = new AntInterface({logger})
          
            _console = console
            _env = process.env

            console.log = jest.fn()
            process.env.ANT_DEBUG = undefined
            logger.logEvent = jest.fn()
        })

        afterEach( ()=>{
            console.log = _console.log
            process.env = _env
        })

        test('normal',()=>{
            i.logEvent({message:'test'})
            expect(logger.logEvent).toHaveBeenCalled()
            expect(console.log).not.toHaveBeenCalled()
        })

        test('log disabled',()=>{
            i.disableLogging()
            i.logEvent({message:'test'})
            expect(logger.logEvent).not.toHaveBeenCalled()
            expect(console.log).not.toHaveBeenCalled()

            i.enableLogging()
            i.logEvent({message:'test'})
            expect(logger.logEvent).toHaveBeenCalled()

        })

        test('debug log',()=>{
            process.env.ANT_DEBUG='true'
            
            i.logEvent({message:'test'})
            expect(console.log).toHaveBeenCalledTimes(1)

            process.env.ANT_DEBUG='1'
            i.logEvent({message:'test'})
            expect(console.log).toHaveBeenCalledTimes(2)

            process.env.ANT_DEBUG='yes'
            i.logEvent({message:'test'})
            expect(console.log).toHaveBeenCalledTimes(3)

            process.env.ANT_DEBUG='no'
            i.logEvent({message:'test'})
            expect(console.log).toHaveBeenCalledTimes(3)

            process.env.ANT_DEBUG=''
            i.logEvent({message:'test'})
            expect(console.log).toHaveBeenCalledTimes(3)

        })

    })

    describe('connect',()=>{


        let i:AntInterface
        
        beforeEach( ()=>{
        
            i = new AntInterface({binding:MockBinding})
            i.disableLogging()

            MockBinding.prototype.open = jest.fn().mockResolvedValue(true)          
        })

        test('success',async()=>{
            const res = await i.connect()
            expect(res).toBe(true)
            expect(i.isConnected()).toBe(true)
        })

        test('already connected',async()=>{
            i.isConnected = jest.fn().mockReturnValue(true)
            i.logEvent = jest.fn()
            const res = await i.connect()
            expect(res).toBe(true)
            expect(i.logEvent).not.toHaveBeenCalledWith('ANT+ connecting ...')
            

        })
        test('currently connecting',async()=>{
            MockBinding.prototype.open = jest.fn( async ()=>{ await sleep(50); return true})
            const c1 = i.connect()
            await sleep(10)
            const c2 = i.connect()
            const res = await Promise.allSettled([c1,c2])
            expect(res[0]).toEqual( {status:'fulfilled', value:true})
            expect(res[1]).toEqual( {status:'fulfilled', value:true})

        })

        test('cannot open',async()=>{
            MockBinding.prototype.open = jest.fn().mockResolvedValue(false)
            const res = await i.connect()
            expect(res).toBe(false)

        })
        test('Error thrown',async()=>{
            MockBinding.prototype.open = jest.fn().mockRejectedValue( new Error('X'))
            const res = await i.connect()
            expect(res).toBe(false)

        })

    })

    describe('disconnect',()=>{
        let i:AntInterface
        let device
        
        beforeEach( ()=>{        
            i = new AntInterface({binding:MockBinding})
            i.disableLogging();

            device = {
                close: jest.fn().mockResolvedValue(true)
            };

            (i as any).device = device
            
        })

        test('connected',async()=>{
            const res = await i.disconnect()
            expect(res).toBe(true)
            expect(device.close).toHaveBeenCalled()
            expect(i.isConnected()).toBe(false)
        })

        test('not connected, but device still set',async()=>{
            i.isConnected = jest.fn().mockReturnValue(false)
            const res = await i.disconnect()
            expect(res).toBe(true)
            expect(device.close).toHaveBeenCalled()

        })
        test('no device',async()=>{
            (i as any).device = undefined
            const res = await i.disconnect()
            expect(res).toBe(true)

        })
        test('device close fails',async()=>{
            device.close = jest.fn().mockReturnValue(false)
            const res = await i.disconnect()
            expect(res).toBe(false)
            expect(i.isConnected()).toBe(false)
        })
        test('device close throws error',async()=>{
            device.close = jest.fn().mockRejectedValue( new Error('X'))
            const res = await i.disconnect()
            expect(res).toBe(false)
            expect(i.isConnected()).toBe(false)

        })
        
    })

    describe('scan', ()=>{
        let i:AntInterface
        let device,channel
        
        beforeEach( ()=>{        
            i = new AntInterface({binding:MockBinding})
            i.disableLogging();
            i.getReconnectPause = jest.fn().mockReturnValue(10)
            i.isConnected = jest.fn().mockResolvedValue(true)
            i.stopScan = jest.fn().mockResolvedValue(true)
            jest.spyOn(i,'emit')

            channel = new EventEmitter() as Channel
            channel.attach = jest.fn()
            channel.setProps = jest.fn()
            channel.startScanner = jest.fn().mockResolvedValue(true)
           
            device = {
                close: jest.fn().mockResolvedValue(true),
                getChannel: jest.fn().mockReturnValue(channel)
            };
            (i as any).device = device
        })


        test('successfull start - one device detected' , async ()=>{
            channel.attach= jest.fn( async ()=> {
                Promise.resolve(true)
                await sleep(10)
                channel.emit('detected','FE',2606)
                channel.emit('data','FE',2606,{DeviceID:2606},'')
            })
            

            const res = await i.scan({timeout:100})
            expect(i.emit).toHaveBeenCalledWith('device',{deviceID:2606, interface:'ant', profile:'FE'})
            expect(i.emit).toHaveBeenCalledWith('data','FE',2606,{DeviceID:2606},'')
            
            expect(res).toEqual([{deviceID:2606, interface:'ant', profile:'FE'}])
        })


        test('successfull start - no device detected' , async ()=>{
            channel.attach= jest.fn( async ()=> {
                Promise.resolve(true)
            })
            
            const res = await i.scan({timeout:100})
            expect(i.emit).not.toHaveBeenCalledWith('device',expect.anything())            
            expect(i.emit).not.toHaveBeenCalledWith('data',expect.anything())            
            expect(res).toEqual([])
        })
            
        test('successfull start - channel emits error' , async ()=>{
            channel.attach= jest.fn( async ()=> {
                Promise.resolve(true)
                await sleep(10)
                channel.emit('error','FE','XX')
            })
            i.logEvent = jest.fn()
            
            const res = await i.scan({timeout:100})
            expect(i.emit).not.toHaveBeenCalledWith('device',expect.anything())            
            expect(i.emit).not.toHaveBeenCalledWith('data',expect.anything())            
            expect(res).toEqual([])
            expect(i.logEvent).toHaveBeenCalledWith({message:'ANT+ERROR:',profile:'FE',error:'XX'})
        })
        

        test('not connected, reconnect fails' , async ()=>{
            i.isConnected = jest.fn().mockReturnValue(false)
            i.connect = jest.fn().mockResolvedValue(false)
            const res = await i.scan({timeout:100})
            expect(res).toEqual([])
        })

        test('no channel' , async ()=>{
            device.getChannel = jest.fn().mockReturnValue(undefined)

            const res = await i.scan({timeout:100})
            expect(res).toEqual([])
        })

        test('start Scanner fails' , async ()=>{
            channel.startScanner = jest.fn().mockResolvedValue(false)

            const res = await i.scan({timeout:100})
            expect(res).toEqual([])
        })

        test('start Scanner throws error' , async ()=>{
            channel.startScanner = jest.fn().mockRejectedValue(new Error('X'))

            const res = await i.scan({timeout:100})
            expect(res).toEqual([])
        })

        test('parallel scans',async ()=> {
            channel.startScanner =  jest.fn( async ()=>{ await sleep(50); return true})


            const s1 = i.scan({timeout:100})
            await sleep(10)
            const s2 = i.scan({timeout:100})

            const res = await Promise.allSettled([s1,s2])
            expect(res[0]).toEqual( {status:'fulfilled', value:[]})
            expect(res[1]).toEqual( {status:'fulfilled', value:[]})


        })

    })

    describe('stopScan', ()=>{

        let i:AntInterface
        let device,channel
        
        beforeEach( ()=>{        
            i = new AntInterface({binding:MockBinding})
            i.disableLogging();
            i.getReconnectPause = jest.fn().mockReturnValue(10)
            i.isConnected = jest.fn().mockResolvedValue(true)

            channel = new EventEmitter() as Channel
            channel.attach = jest.fn()
            channel.setProps = jest.fn()
            channel.startScanner = jest.fn().mockResolvedValue(true)
            channel.stopScanner = jest.fn().mockResolvedValue(true)
           
            device = {
                close: jest.fn().mockResolvedValue(true),
                getChannel: jest.fn().mockReturnValue(channel)
            };
            (i as any).device = device
        })

        test('scan detected devices' ,async ()=>{
            channel.attach= jest.fn( async ()=> {
                Promise.resolve(true)
                await sleep(10)
                channel.emit('detected','FE',2606)
                channel.emit('data','FE',2606,{DeviceID:2606},'')
            })


            let res;
            
            const scanRes = await new Promise (async (done)=> {
                i.scan().then(r=> {done(r)})
                await sleep(200)
                res = await i.stopScan()
            })

            expect(res).toBe(true)
            expect(scanRes).toEqual([{deviceID:2606, interface:'ant', profile:'FE'}])
        })

        test('not connected, reconnect fails' , async ()=>{
            i.isConnected = jest.fn().mockReturnValue(false)
            i.connect = jest.fn().mockResolvedValue(false)

            let res;
            
            const scanRes = await new Promise (async (done)=> {
                i.scan().then(r=> {done(r)})
                await sleep(100)
                res = await i.stopScan()
            })

            expect(res).toBe(true)
            expect(scanRes).toEqual([])
        })

        test('not scanning',async ()=>{
            i.isScanning = jest.fn().mockReturnValue(false)
            const res = await i.stopScan()
            expect(res).toBe(true)

        })
        
    })

    describe('startSensor', ()=>{
        let i:AntInterface
        let device,channel
        
        beforeEach( ()=>{        
            i = new AntInterface({binding:MockBinding})
            i.disableLogging();
            i.getReconnectPause = jest.fn().mockReturnValue(10)
            i.isConnected = jest.fn().mockResolvedValue(true)
            i.connect = jest.fn().mockResolvedValue(true)
            jest.spyOn(i,'emit')

            channel = new EventEmitter() as Channel
            channel.attach = jest.fn()
            channel.setProps = jest.fn()
            channel.startSensor = jest.fn().mockResolvedValue(true)
            channel.stopSensor = jest.fn().mockResolvedValue(true)
           
            device = {
                close: jest.fn().mockResolvedValue(true),
                getChannel: jest.fn().mockReturnValue(channel)
            };
            (i as any).device = device
        })

        test('success',async()=>{
            const sensor = new FitnessEquipmentSensor(2606)
            const onDeviceData = jest.fn()
            const res = await i.startSensor( sensor, onDeviceData)
            expect(res).toBe(true)

        })

        test('processing data',async()=>{

            const sensor = new FitnessEquipmentSensor(2606)
            channel.startSensor = jest.fn( ()=> new Promise( async done=>{
                console.log('start')
                done(true)
                console.log('emit')
                channel.emit('data','FE',2606,{data:'test0'},'tag')
                channel.emit('data','FE',2606,{data:'test1'},'tag')
                channel.emit('data','FE',2606,{data:'test2'},'tag')
            }))
            const onDeviceData = jest.fn()
            const res = await i.startSensor( sensor, onDeviceData)
            expect(res).toBe(true)

            await sleep(10)
            expect(i.emit).toHaveBeenCalledWith('data','FE',2606,expect.anything(), 'tag')
            expect(onDeviceData).toHaveBeenCalledWith( {data:expect.anything()})

        })

        test('no channel' , async ()=>{
            device.getChannel = jest.fn().mockReturnValue(undefined) 
            const sensor = new FitnessEquipmentSensor(2606)
            const onDeviceData = jest.fn()
            const res = await i.startSensor( sensor, onDeviceData)
            expect(res).toBe(false)

        })

        test('not connected , reconnect success',async()=>{
            i.isConnected = jest.fn()
                .mockReturnValueOnce(false)
                .mockReturnValue(true)
            const sensor = new FitnessEquipmentSensor(2606)
            const onDeviceData = jest.fn()
            const res = await i.startSensor( sensor, onDeviceData)
            expect(res).toBe(true)

        })

        test('not connected , reconnect fails',async()=>{
            i.isConnected = jest.fn()
                .mockReturnValue(false)
            i.connect = jest.fn().mockResolvedValue(false)

            const sensor = new FitnessEquipmentSensor(2606)
            const onDeviceData = jest.fn()
            const res = await i.startSensor( sensor, onDeviceData)
            expect(res).toBe(false)

        })

        test('start Sensor fails',async()=>{
            channel.startSensor= jest.fn().mockResolvedValue(false)

            const sensor = new FitnessEquipmentSensor(2606)
            const onDeviceData = jest.fn()
            const res = await i.startSensor( sensor, onDeviceData)
            expect(res).toBe(false)

        })

        test('start Sensor throws',async()=>{
            channel.startSensor= jest.fn().mockRejectedValue( new Error('X'))

            const sensor = new FitnessEquipmentSensor(2606)
            const onDeviceData = jest.fn()
            const res = await i.startSensor( sensor, onDeviceData)
            expect(res).toBe(false)
            expect(channel.stopSensor).toHaveBeenCalled()

        })

        
    })

    describe('stopSensor', ()=>{
        let i:AntInterface
        let device,channel, sensor
        
        beforeEach( ()=>{        
            i = new AntInterface({binding:MockBinding})
            i.disableLogging();
            i.isConnected = jest.fn().mockReturnValue(true)


            channel = new EventEmitter() as Channel
            channel.attach = jest.fn()
            channel.setProps = jest.fn()
            channel.startSensor = jest.fn().mockResolvedValue(true)
            channel.stopSensor = jest.fn().mockResolvedValue(true)
            channel.flush = jest.fn()

            sensor = new FitnessEquipmentSensor(2606)
            sensor.getChannel = jest.fn().mockReturnValue(channel)

            device = {
                close: jest.fn().mockResolvedValue(true),
                getChannel: jest.fn().mockReturnValue(channel)
            };
            (i as any).device = device
        })

        test('normal flow',async ()=>{
            const res = await i.stopSensor(sensor)
            expect(res).toBe(true)
            expect(channel.flush).toHaveBeenCalled()
            expect(channel.stopSensor).toHaveBeenCalled()
        })

        test('not connected',async ()=>{
            i.isConnected = jest.fn().mockReturnValue(false)
            const res = await i.stopSensor(sensor)
            expect(res).toBe(true)
            expect(channel.stopSensor).not.toHaveBeenCalled()

        })

        test('not connected',async ()=>{
            i.isConnected = jest.fn().mockReturnValue(false)
            const res = await i.stopSensor(sensor)
            expect(res).toBe(true)
            expect(channel.stopSensor).not.toHaveBeenCalled()

        })

        test('no channel',async ()=>{
            sensor.getChannel = jest.fn().mockReturnValue(undefined)
            const res = await i.stopSensor(sensor)
            expect(res).toBe(false)
        })

        test('channel flush does not exist',async ()=>{
            channel.flush = undefined
            channel.messageQueue = [ {resolve:jest.fn()}]

            const res = await i.stopSensor(sensor)
            expect(res).toBe(true)
            expect(channel.stopSensor).toHaveBeenCalled()

        })
        test('error thrown',async ()=>{
            channel.stopSensor = jest.fn().mockRejectedValue(new Error('X'))
            const res = await i.stopSensor(sensor)
            expect(res).toBe(false)

        })

    })

})