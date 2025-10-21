import { BicyclePowerSensorState } from 'incyclist-ant-plus'
import { IncyclistCapability } from '../../types'
import { AntDeviceSettings } from '../types'
import AntPwrAdapter from './adapter'


const D = (data:any):BicyclePowerSensorState => {
    return {
        PairedDevices:[],
        RawData: Buffer.from([]),
        ...data
    }
}

describe( 'ANT PWR adapter', ()=>{ 

    describe('constructor',()=>{
        test('typical settings, empty props',()=>{
            const settings = {       
                name: 'XXXX',
                selected: true,
                deviceID: '2606',
                profile: 'PWR',
                interface: 'ant'
            } as AntDeviceSettings
            const adapter = new AntPwrAdapter(settings,{})

            // simple getters
            expect(adapter.getID()).toBe('2606')                        
            expect(adapter.getName()).toBe('XXXX')
            expect(adapter.getCapabilities()).toEqual([IncyclistCapability.Power, IncyclistCapability.Cadence, IncyclistCapability.Speed])

        })

        test('minimal settings',()=>{
            const settings:AntDeviceSettings = {       
                deviceID: '2606',
                profile: 'PWR',
                interface: 'ant'
            }  as AntDeviceSettings
            const adapter = new AntPwrAdapter(settings,{})

            // simple getters
            expect(adapter.getID()).toBe('2606')                        
            expect(adapter.getName()).toBe('Ant+PWR 2606')

        })
        test('legacy settings',()=>{
            const settings = {       
                deviceID: '2606',
                profile: 'Power Meter',
                interface: 'ant',
                protocol: 'Ant'

            } as AntDeviceSettings
            const adapter = new AntPwrAdapter(settings,{})

            // simple getters
            expect(adapter.getID()).toBe('2606')                        
            expect(adapter.getName()).toBe('Ant+PWR 2606')

        })

        test('incorrect profile',()=>{
            const settings = {       
                deviceID: '2606',
                profile: 'Smart Trainer',
                interface: 'ant'
            } as AntDeviceSettings

            let adapter,error;
            try {
                adapter = new AntPwrAdapter(settings,{})
            }
            catch(err) {
                error = err;
            }
            expect(adapter).toBeUndefined()
            expect(error).toBeDefined()
        })
        test('legacy: incorrect profile',()=>{
            const settings = {       
                deviceID: '2606',
                profile: 'Smart Trainer',
                interface: 'ant',
                protocol: 'Ant'
            } as AntDeviceSettings

            let adapter,error;
            try {
                adapter = new AntPwrAdapter(settings,{})
            }
            catch(err) {
                error = err;
            }
            expect(adapter).toBeUndefined()
            expect(error).toBeDefined()
        })        

    })
    describe('getUniqueName',()=>{
        let adapter:AntPwrAdapter
        beforeEach( ()=>{            
            adapter = new AntPwrAdapter({deviceID: '2606',profile: 'PWR',interface: 'ant'})
        })

        test('no data (yet)',()=>{
            expect(adapter.getUniqueName()).toBe('Ant+PWR 2606')
        })

        test('has received PWR data',()=>{
            adapter.deviceData.Power = 150
            expect(adapter.getUniqueName()).toBe('Ant+PWR 2606')
        })

        test('has received ManId',()=>{
            adapter.deviceData.ManId = 123
            expect(adapter.getUniqueName()).toBe('Polar PWR 2606')
        })

        test('has received ManId and PWR data',()=>{
            adapter.deviceData.ManId = 123
            adapter.deviceData.Power = 150
            expect(adapter.getUniqueName()).toBe('Polar PWR 2606')
        })

        test('name is in settings',()=>{
            adapter.settings.name = 'Emma'
            adapter.deviceData.ManId = 123
            adapter.deviceData.Power = 150
            expect(adapter.getUniqueName()).toBe('Emma')
        })

    })

    describe('mapData',()=>{
        let a:AntPwrAdapter 

        beforeEach(()=>{
            a  = new AntPwrAdapter({deviceID: '2606',profile: 'PWR',interface: 'ant'})
        })

        test('No Data',()=>{
            const res = a.mapData(D({}))
            expect(res).toEqual({power:0, speed:0, pedalRpm:0,isPedalling:false})           
        })

        test('Power',()=>{
            const res = a.mapData(D({Power:100}))
            expect(res).toMatchObject({power:100})           
        })
        test('CalculatedPower without Power',()=>{
            const res = a.mapData(D({CalculatedPower:100}))
            expect(res).toMatchObject({power:100})           
        })
        test('CalculatedPower and Power',()=>{
            const res = a.mapData(D({CalculatedPower:100, Power:120}))
            expect(res).toMatchObject({power:120})           
        })

        test('Cadence',()=>{            
            const res = a.mapData(D({Cadence:90}))
            expect(res).toMatchObject({pedalRpm:90,isPedalling:true})           
        })
        test('CalculatedCadence without Cadence',()=>{
            const res = a.mapData(D({CalculatedCadence:90}))
            expect(res).toMatchObject({pedalRpm:90,isPedalling:true})           
        })
        test('CalculatedCadence and Cadence',()=>{
            const res = a.mapData(D({CalculatedCadence:100, Cadence:90}))
            expect(res).toMatchObject({pedalRpm:90,isPedalling:true})           
        })
        test('CalculatedCadence and Cadence',()=>{
            const res = a.mapData(D({CalculatedCadence:100, Cadence:90}))
            expect(res).toMatchObject({pedalRpm:90,isPedalling:true})           
        })
        test('Timestamp',()=>{
            const res = a.mapData(D({TimeStamp:550.5}))
            expect(res).toMatchObject({time:550.5})           
        })

        test('receiving Power without Cadence',()=>{
            const res = a.mapData(D({Power:90}))             
            expect(res.pedalRpm).toBe(0)
            expect(res.isPedalling).toBe(true)
        })

        test('receiving Power with Cadence',()=>{
            const res = a.mapData(D({Power:90, Cadence:30}))            
            expect(res.pedalRpm).toBe(30)
            expect(res.isPedalling).toBe(true)
        })


        test('Slope',()=>{
            const res = a.mapData(D({Slope:1.1}))
            expect(res).toEqual({power:0, speed:0, pedalRpm:0,isPedalling:false})                  
        })

        
    })

    describe('transformData',()=>{
        let a:AntPwrAdapter 

        beforeEach(()=>{
            a  = new AntPwrAdapter({deviceID: '2606',profile: 'PWR',interface: 'ant'})
        })

        test('normal data',()=>{
            a.transformData({power:100, pedalRpm:90,speed:0, isPedalling:true, time:10})
            expect(a.getData()).toEqual({power:100, cadence:90, speed:0,deviceTime:10, timestamp:expect.anything(),})
        })
        test('no time',()=>{
            a.transformData({power:100, pedalRpm:90,speed:0, isPedalling:true})
            expect(a.getData()).toEqual({power:100, cadence:90, speed:0, timestamp:expect.anything()})
        })
 
    })

    describe('onDeviceData',()=>{
        let a:AntPwrAdapter 

        beforeEach(()=>{
            jest.useFakeTimers()
            a  = new AntPwrAdapter({deviceID: '2606',profile: 'PWR',interface: 'ant'})
            jest.spyOn(a,'emitData')
        })

        afterEach( ()=>{
            jest.useRealTimers()
        })

        test('normal data',()=>{
            
            a.onDeviceData({Offset:0,DeviceID:29832,PedalPower:100,RightPedalPower:100,LeftPedalPower:0,Cadence:52,AccumulatedPower:7274,Power:150,ManId:51})
            jest.advanceTimersByTime(1005)
            a.onDeviceData({Offset:0,DeviceID:29832,PedalPower:100,RightPedalPower:100,LeftPedalPower:0,Cadence:52,AccumulatedPower:7274,Power:150,ManId:51})
            expect(a.emitData).toHaveBeenLastCalledWith({speed:expect.closeTo(6.8,1),cadence:52, power:150, deviceTime:expect.closeTo(1,0), timestamp:expect.anything()})
        })

    })


    describe('hasData',()=>{
        let a:AntPwrAdapter 

        beforeEach(()=>{
            a  = new AntPwrAdapter({deviceID: '2606',profile: 'PWR',interface: 'ant'})
        })

        test('No Data',()=>{
            a.deviceData = D({})            
            expect(a.hasData()).toBe(false)
        })

        test('Power',()=>{
            a.deviceData = D({Power:100})            
            expect(a.hasData()).toBe(true)
        })
        test('CalculatedPower without Power',()=>{
            a.deviceData = D({CalculatedPower:100})
            expect(a.hasData()).toBe(true)
        })
        test('CalculatedPower and Power',()=>{
            a.deviceData = D({CalculatedPower:100, Power:120})
            expect(a.hasData()).toBe(true)
        })

        test('Cadence',()=>{            
            a.deviceData = D({Cadence:90})
            expect(a.hasData()).toBe(true)
        })
        test('CalculatedCadence without Cadence',()=>{
            a.deviceData = D({CalculatedCadence:90})
            expect(a.hasData()).toBe(true)
        })
        test('CalculatedCadence and Cadence',()=>{
            a.deviceData = D({CalculatedCadence:100, Cadence:90})
            expect(a.hasData()).toBe(true)
        })
        test('Timestamp',()=>{
            a.deviceData = D({TimeStamp:550.5})
            expect(a.hasData()).toBe(false)
        })

        test('Slope',()=>{
            a.deviceData = D({Slope:1.1}) 
            expect(a.hasData()).toBe(false)
        })

        
    })

    describe('sendUpdate',()=>{
        let a:AntPwrAdapter 

        beforeEach(()=>{
            a  = new AntPwrAdapter({deviceID: '2606',profile: 'PWR',interface: 'ant'})
            a.getCyclingMode().buildUpdate= jest.fn()
        })

        test('sending slope updae',()=>{
            a.sendUpdate({slope:1.2})           
            expect(a.getCyclingMode().buildUpdate).toHaveBeenCalledWith({slope:1.2})
        })

        test('paused',()=>{
            a.isPaused = jest.fn().mockReturnValue(true)
            expect(a.getCyclingMode().buildUpdate).not.toHaveBeenCalled()
        })
        test('stopped',()=>{
            a.isPaused = jest.fn().mockReturnValue(true)
            expect(a.getCyclingMode().buildUpdate).not.toHaveBeenCalled()
        })

        
    })
    

})