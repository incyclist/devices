import TacxAdvancedFitnessMachineDevice from "./sensor";
import {TACX_FE_C_RX} from "./consts";

describe('Tacx Sensor',()=>{

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

    })

})