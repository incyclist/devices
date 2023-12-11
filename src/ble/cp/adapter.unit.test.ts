import { BlePwrAdapter, PowerData } from "."
import { IncyclistCapability } from "../../types"

const D = (data):PowerData => {
    return {
        time:1,
        ...data
    }
}

describe('BLE Pwr Adapter',()=>{

    describe('constructor',()=>{

        test('statics',()=>{
            const a = new BlePwrAdapter({interface:'ble', protocol:'cp',name:'CP-Mock',address:'44:0d:ec:12:40:61'})

            expect(a.getProfile()).toBe('Power Meter')
            expect(a.getName()).toBe('CP-Mock')
            expect(a.getUniqueName()).toBe('CP-Mock 4461')  
            expect(a.getInterface()).toBe('ble') 
            expect(a.getSettings()).toEqual({interface:'ble', protocol:'cp',name:'CP-Mock',address:'44:0d:ec:12:40:61'})
            expect(a.isEqual({interface:'ble', protocol:'cp',name:'CP-Mock',address:'44:0d:ec:12:40:61'})).toBe(true)
            expect(a.isSame(a)).toBe(true)
            expect(a.getCapabilities()).toEqual([IncyclistCapability.Power,IncyclistCapability.Cadence,IncyclistCapability.Speed])
            expect(a.hasCapability(IncyclistCapability.Power)).toBe(true)
            expect(a.hasCapability(IncyclistCapability.Cadence)).toBe(true)
            expect(a.hasCapability(IncyclistCapability.Speed)).toBe(true)
            expect(a.isControllable()).toBe(true)
            expect(a.getDefaultCyclingMode()).toBeDefined()
            expect(a.getCyclingMode()).toBeDefined()
            expect(a.isStarted()).toBe(false)
            expect(a.isStopped()).toBe(false)
            expect(a.isPaused()).toBe(false)
        })
    })

    describe('onDeviceData',()=>{
        let a: BlePwrAdapter
        let emitData
        beforeEach( ()=>{
            a = new BlePwrAdapter({interface:'ble', protocol:'cp',name:'CP-Mock',address:'44:0d:ec:12:40:61'})
            emitData = jest.spyOn(a,'emitData')
        })

        test( 'normal data',()=>{
            a.onDeviceData({rpm:90,instantaneousPower:150, time:10})
            expect(emitData).toHaveBeenCalledWith(expect.objectContaining({cadence:90, power:150}))
        } )
    })

    describe('sendUpdate',()=>{
        let a: BlePwrAdapter
        beforeEach( ()=>{
            a = new BlePwrAdapter({interface:'ble', protocol:'cp',name:'CP-Mock',address:'44:0d:ec:12:40:61'})
            a.getCyclingMode().sendBikeUpdate= jest.fn()
        })

        test('sending slope updae',()=>{
            a.sendUpdate({slope:1.2})           
            expect(a.getCyclingMode().sendBikeUpdate).toHaveBeenCalledWith({slope:1.2})
        })

        test('sending target Power',()=>{
            a.sendUpdate({targetPower:100})           
            expect(a.getCyclingMode().sendBikeUpdate).toHaveBeenCalledWith({targetPower:100})
        })

        test('paused',()=>{
            a.isPaused = jest.fn().mockReturnValue(true)
            expect(a.getCyclingMode().sendBikeUpdate).not.toHaveBeenCalled()
        })
        test('stopped',()=>{
            a.isPaused = jest.fn().mockReturnValue(true)
            expect(a.getCyclingMode().sendBikeUpdate).not.toHaveBeenCalled()
        })
    })


    describe.skip('mapData',()=>{
        let a: BlePwrAdapter
        beforeEach( ()=>{
            a = new BlePwrAdapter({interface:'ble', protocol:'cp',name:'CP-Mock',address:'44:0d:ec:12:40:61'})
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
        let a: BlePwrAdapter
        beforeEach( ()=>{
            a = new BlePwrAdapter({interface:'ble', protocol:'cp',name:'CP-Mock',address:'44:0d:ec:12:40:61'})
        })


        test('normal data',()=>{
            const data = a.transformData({power:100, pedalRpm:90,speed:10, isPedalling:true, time:10})
            expect(data).toEqual({power:100, cadence:90, deviceTime:10, speed:10,timestamp:expect.anything()})
        })
        test('no time',()=>{
            const data = a.transformData({power:100, pedalRpm:90,speed:0, isPedalling:true})
            expect(data).toEqual({power:100, cadence:90,  speed:0, timestamp:expect.anything()})
        })
 
    })
    

})