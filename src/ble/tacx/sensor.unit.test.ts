import TacxAdvancedFitnessMachineDevice from "./sensor";
import {TACX_FE_C_RX, TACX_FE_C_TX} from "./consts";
import { MockLogger } from "../../../test/logger";
import { CSP_MEASUREMENT } from "../consts";

describe('Tacx Sensor',()=>{

    describe('constructor',()=>{

        test('without peripheral',()=>{
            const c = new TacxAdvancedFitnessMachineDevice(null,{id:'4711',logger:MockLogger})

            // statics
            expect(c.getProfile()).toBe('Smart Trainer')
            expect(c.getProtocol()).toBe('tacx')
            expect(c.getServiceUUids()).toEqual(['6E40FEC1-B5A3-F393-E0A9-E50E24DCCA9E'])


        })
        test('with peripheral',()=>{
            
        })


    })


    describe('onData',()=>{

        let sensor: TacxAdvancedFitnessMachineDevice
        let logSpy = jest.fn()
        const send = (d)=>sensor.onData(TACX_FE_C_RX,Buffer.from(d,'hex'))

        beforeEach(()=>{
            sensor = new TacxAdvancedFitnessMachineDevice(null)
            sensor.logEvent = logSpy
        })

        afterEach(()=>{
            jest.resetAllMocks()
        })

        test('Missing SYNC',()=>{          
            expect(send('12a4094e05191f00000000402080')).toBeUndefined()
            expect(logSpy).toHaveBeenCalledWith({message:'SYNC missing',raw:'12a4094e05191f00000000402080'})
        })

        test('Valid TacxRx GeneralFE data',()=>{
            expect(send('a4094e05101900000000ff2434')).toEqual({State:'READY', EquipmentType:'Trainer', speed:0, raw:expect.any(String)})   
            expect(send('a4094e05101900000000303534')).toMatchObject({State:'IN_USE', EquipmentType:'Trainer', heartrate:48})
            expect(send('a4094e05101900000000ff1434')).toMatchObject({State:'OFF'})   
            expect(send('a4094e05101900000000ff4434')).toMatchObject({State:'FINISHED'})   
        })

        
        test('Valid TacxRx Trainer data',()=>{
            expect(send('a4094e05191f00000000402080')).toMatchObject({State:'READY'})
        })
        test('Valid TacxRx Product information',()=>{
            expect(send('a4094e0551ff00070f57000017')).toMatchObject({SerialNumber:22287, SwVersion:7})
        })


        test('power',()=>{
           
            sensor.onData(CSP_MEASUREMENT,Buffer.from([3,119,1,0,0,195,176,48,0,0,32]));
            const res = sensor.onData(CSP_MEASUREMENT, Buffer.from([3,119,1,0,0,195,176,48,0,0,56]));
            expect(res).toMatchObject({instantaneousPower:1})
        }) 
    
    
        test('repeated message',()=>{
    
            sensor.emit = jest.fn()
    
            sensor.onData('2a5b',Buffer.from([3,119,1,0,0,195,176,48,0,0,32]));
            sensor.onData('2a5b',Buffer.from([3,119,1,0,0,195,176,48,0,0,32]));
            sensor.onData('2a5b',Buffer.from([3,119,1,0,0,195,176,48,0,0,32]));
            sensor.onData('2a5b',Buffer.from([3,119,1,0,0,195,176,48,0,0,32]));
            expect(sensor.emit).toHaveBeenCalledTimes(1)
        }) 


    })

    describe ('setSlope',()=>{
    
        test('slope 0.0, rr not set',async ()=>{
            const expected = Buffer.from( 'A4094F0533FFFFFFFF204E42F8','hex')
            const peripheral = {
                write: jest.fn().mockResolvedValue(expected),
                isConnected: jest.fn().mockReturnValue(true)
            }
            const tacx = new TacxAdvancedFitnessMachineDevice(peripheral, {id:'4711',logger:MockLogger});
            
            const res = await tacx.setSlope(0.0)
            expect(res).toBe(true)
            expect(peripheral.write).toHaveBeenCalledWith(TACX_FE_C_TX, expected,{withoutResponse:true})
        })
        test('not connected',async ()=>{
            const expected = Buffer.from( 'A4094F0533FFFFFFFF204E42F8','hex')
            const peripheral = {
                write: jest.fn().mockResolvedValue(expected),
                isConnected: jest.fn().mockReturnValue(false)
            }
            const tacx = new TacxAdvancedFitnessMachineDevice(peripheral, {id:'4711',logger:MockLogger});
            
            const res = await tacx.setSlope(0.0)
            expect(res).toBe(false)
            expect(peripheral.write).not.toHaveBeenCalled()
        })
    
    
    })

})