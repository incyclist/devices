import { CSP_MEASUREMENT } from "./consts";
import TacxAdvancedFitnessMachineDevice from "./tacx";

class MockLogger {
    logEvent(d) { if (process.env.DEBUG) console.log(d)}
    log(m){ if (process.env.DEBUG) console.log({message:m})}
}


describe ('onData',()=>{
    test('trainerData',()=>{
        const data = [164,9,78,5,25,165,0,36,92,0,0,32,2]
        const message = Buffer.from(data);
        const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:new MockLogger()});

        const res = tacx.onData('6e40fec2-b5a3-f393-e0a9-e50e24dcca9e',message);
        expect(res).toEqual({State:'READY',raw:'a4094e0519a500245c00002002'})
    }) 

    test('trainerData - error: unknown message id' ,()=>{
        
        const data = [164,9,78,5,251,0,7,4,0,8,4,0,18] 
        const message = Buffer.from(data);
        const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:new MockLogger()});

        const res = tacx.onData('6e40fec2-b5a3-f393-e0a9-e50e24dcca9e',message);
        expect(res).toBeUndefined();
    }) 

    test('generalFEData',()=>{
        const data = [164,9,78,5,16,25,46,72,0,0,255,36,82] 
        const message = Buffer.from(data);
        const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:new MockLogger()});

        const res = tacx.onData('6e40fec2-b5a3-f393-e0a9-e50e24dcca9e',message);
        expect(res).toEqual({State:'READY',EquipmentType:'Trainer',speed:0,raw:'a4094e0510192e480000ff2452'})
    }) 


    test('power',()=>{
        const data1 = [3,119,1,0,0,195,176,48,0,0,56]

        let message;

        const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:new MockLogger()});

        
        tacx.onData(CSP_MEASUREMENT,Buffer.from([3,119,1,0,0,195,176,48,0,0,32]));
        const res = tacx.onData(CSP_MEASUREMENT, Buffer.from(data1));
        expect(res).toMatchObject({instantaneousPower:1})
    }) 


    test('repeated message',()=>{
        const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:new MockLogger()});

        tacx.logEvent = jest.fn();

        tacx.onData('2a5b',Buffer.from([3,119,1,0,0,195,176,48,0,0,32]));
        tacx.onData('2a5b',Buffer.from([3,119,1,0,0,195,176,48,0,0,32]));
        tacx.onData('2a5b',Buffer.from([3,119,1,0,0,195,176,48,0,0,32]));
        tacx.onData('2a5b',Buffer.from([3,119,1,0,0,195,176,48,0,0,32]));
        expect(tacx.messageCnt).toBe(1)
    }) 


    

})


describe ('parseProductInformation',()=>{

    test('Tacx Neo',()=>{
        const data = [81,255,0,7,60,115,0,0] 
        const message = Buffer.from(data);
        const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:new MockLogger()});
        const res = tacx.parseProductInformation(message)    
        expect(res).toEqual({SerialNumber:29500, SwVersion:7})
    })


})


describe ('setSlope',()=>{

    test('slope 0.0',async ()=>{
        const data = [81,255,0,7,60,115,0,0] 
        const message = Buffer.from(data);
        const tacx = new TacxAdvancedFitnessMachineDevice({id:'4711',logger:new MockLogger()});
        const res = await tacx.setSlope(0.0)
        expect(res).toBe(true)
    })


})

