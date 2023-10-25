import { MockLogger } from "../../../test/logger";
import { CSP_MEASUREMENT } from "../consts";
import TacxAdvancedFitnessMachineDevice from "./comms";

describe('BleTacxComms',()=> {

    describe('constructor',()=>{

        test('without peripheral',()=>{
            const c = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:MockLogger})

            // statics
            expect(c.getProfile()).toBe('Smart Trainer')
            expect(c.getProtocol()).toBe('tacx')
            expect(c.getServiceUUids()).toEqual(['6e40fec1'])


        })
        test('with peripheral',()=>{
            
        })


    })


    describe ('onData',()=>{
        test('trainerData',()=>{
            const data = [164,9,78,5,25,165,0,36,92,0,0,32,2]
            const message = Buffer.from(data);
            const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:MockLogger});
    
            const res = tacx.onData('6e40fec2-b5a3-f393-e0a9-e50e24dcca9e',message);
            expect(res).toEqual({State:'READY',raw:'a4094e0519a500245c00002002'})
        }) 
    
        test('trainerData - error: unknown message id' ,()=>{
            
            const data = [164,9,78,5,251,0,7,4,0,8,4,0,18] 
            const message = Buffer.from(data);
            const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:MockLogger});
    
            const res = tacx.onData('6e40fec2-b5a3-f393-e0a9-e50e24dcca9e',message);
            expect(res).toBeUndefined();
        }) 
    
        test('generalFEData',()=>{
            const data = [164,9,78,5,16,25,46,72,0,0,255,36,82] 
            const message = Buffer.from(data);
            const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:MockLogger});
    
            const res = tacx.onData('6e40fec2-b5a3-f393-e0a9-e50e24dcca9e',message);
            expect(res).toEqual({State:'READY',EquipmentType:'Trainer',speed:0,raw:'a4094e0510192e480000ff2452'})
        }) 
    
    
        test('power',()=>{
            const data1 = [3,119,1,0,0,195,176,48,0,0,56]
    
            let message;
    
            const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:MockLogger});
    
            
            tacx.onData(CSP_MEASUREMENT,Buffer.from([3,119,1,0,0,195,176,48,0,0,32]));
            const res = tacx.onData(CSP_MEASUREMENT, Buffer.from(data1));
            expect(res).toMatchObject({instantaneousPower:1})
        }) 
    
    
        test('repeated message',()=>{
            const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:MockLogger});
    
            tacx.logEvent = jest.fn();
    
            tacx.onData('2a5b',Buffer.from([3,119,1,0,0,195,176,48,0,0,32]));
            tacx.onData('2a5b',Buffer.from([3,119,1,0,0,195,176,48,0,0,32]));
            tacx.onData('2a5b',Buffer.from([3,119,1,0,0,195,176,48,0,0,32]));
            tacx.onData('2a5b',Buffer.from([3,119,1,0,0,195,176,48,0,0,32]));
            expect(tacx.messageCnt).toBe(1)
        }) 
    
    
        
    
    })

    describe('writeFtmsMessage',()=>{})

    describe('requestControl',()=>{})
    describe('setTargetPower',()=>{})
    describe ('setSlope',()=>{
    
        test('slope 0.0, rr not set',async ()=>{
            const expected = Buffer.from( 'A4094F0533FFFFFFFF204E42F8','hex')
            const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:MockLogger});
            tacx.sendMessage = jest.fn( ()=> Promise.resolve(true) )
            const res = await tacx.setSlope(0.0)
            expect(res).toBe(true)
            expect(tacx.sendMessage).toHaveBeenCalledWith( expected)
        })
    
    
    })

    describe('setTargetInclination',()=>{})
    describe('setIndoorBikeSimulation',()=>{})
    describe('startRequest',()=>{})
    describe('stopRequest',()=>{})
    describe('PauseRequest',()=>{})

    describe( 'parsePower',()=>{
    
        test('bug:strange rpm values',()=>{
            const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:MockLogger});
            tacx.logEvent = jest.fn();
    
            tacx.parsePower( Buffer.from('3000000000000000000000000008','hex'))
            const res = tacx.parsePower( Buffer.from('30001f00020000003b040000000c','hex'))
            expect(res.cadence).toBeLessThan(200)
    
        })
    
    
        test('wheel & crank',()=>{
            const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:MockLogger});
            tacx.logEvent = jest.fn();
    
            const msg1 = '30002700e80400001597e001bdf5'        
            const msg2 = '30002700e9040000b19ae20163fb'
            tacx.parsePower( Buffer.from(msg1,'hex'))
            const res = tacx.parsePower( Buffer.from(msg2,'hex'))
            expect(res.cadence).toBeCloseTo(85,0)
    
        })
    
    })
    
    
    describe ('parseProductInformation',()=>{
    
        test('Tacx Neo',()=>{
            const data = [81,255,0,7,60,115,0,0] 
            const message = Buffer.from(data);
            const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:MockLogger});
            const res = tacx.parseProductInformation(message)    
            expect(res).toEqual({SerialNumber:29500, SwVersion:7})
        })
    
    
    })
    
    
})


