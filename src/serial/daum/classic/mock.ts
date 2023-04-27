import {MockBindingInterface, MockPortBinding,CreatePortOptions, MockBinding} from '@serialport/binding-mock'
import { BindingInterface } from '@serialport/bindings-interface'
import { SerialInterface, SerialPortProvider } from '../../';
import { resolveNextTick } from '../../../utils/utils';
import calc from '../../../utils/calculations'

export type MockProps = {
    interface: string;
    path: string;
}

export interface DaumClassicMockBindingInterface extends BindingInterface<DaumClassicMockBinding> {
    reset(): void
    createPort(path: string, opt?: CreatePortOptions): void
}

// Mock towards SerialPort library
// This needs to be registered to the SerialPortProvider
export const DaumClassicMock : MockBindingInterface = {
    reset() {
        DaumClassicMockImpl.getInstance().reset()
    }, 
    createPort(path: string, options: CreatePortOptions = {}) {
        return DaumClassicMockImpl.getInstance().createPort(path,options)
    },
    async list() {
        return DaumClassicMockImpl.getInstance().list()
    },
    async open(options) {
        return DaumClassicMockImpl.getInstance().open(options)
    }
}

export class DaumClassicMockImpl  {

    static _instance: DaumClassicMockImpl;
   
    static getInstance():DaumClassicMockImpl {
        if (!DaumClassicMockImpl._instance)
            DaumClassicMockImpl._instance = new DaumClassicMockImpl()
        return DaumClassicMockImpl._instance;
    }

    static reset() {
        DaumClassicMockImpl._instance = undefined;
        SerialPortProvider._instance = undefined
        SerialInterface._instances = [];
    }

    simulators: Map<string,DaumClassicSimulator>
    ports: {path:string, binding:DaumClassicMockBinding}[]

    constructor() {
        this.simulators = new Map<string,DaumClassicSimulator>();
        this.ports = [];
    }

    setSimulator( path:string, simulator:DaumClassicSimulator ) {
        this.simulators.set(path,simulator)
    }

    getSimulator(path) {
        return this.simulators.get(path)
    }

    reset() {
        MockBinding.reset();
    }
    createPort(path: string, options: CreatePortOptions = {}) {
        return MockBinding.createPort(path,options)
    }
    async list() {
        return MockBinding.list()
    }
    async open(options) {
        const port = await MockBinding.open(options)
        return new DaumClassicMockBinding(port);
    }




}

export type DaumClassicUser  = {
    weight: number;
    length?: number;
    age?: number;
    sex?: number;
    personNo?: number, 
    pctFat?:number, 
    coachingLevel?:number,
    coachingFrequency?:number,
    powerLimit?:number, 
    hrLimit?:number, 
    timeLimit?:number, 
    distLimit?:number, 
    kcalLimit?:number

}
interface BikeData {    
    cockpitVersion: number
    cockpitType: number
    serialNo: string
    isPedalling: boolean
    bikeType:number
    person: DaumClassicUser 
}

const DEFAULT_BIKE_DATA:BikeData = {
    cockpitVersion: 3,
    serialNo: '4464:<;8',   
    cockpitType: 50,        // 8080
    isPedalling: false,
    bikeType:0,             // RACE
    person: { weight:75, length:180, age:30, sex:0 } 
}

export class DaumClassicSimulator {

    selectedBike:number = 0;
    bikes: BikeData[] = []

    cadence: number
    gear: number
    slope:number
    progNo: number
    heartrate: number
    distance: number
    isPowerMode: boolean
    targetPower: number
    currentPower: number

    _timeoutResponse: number = 0;
    _simulateNoReponseCnt:number = 0
    _simulateIllegalResponseCnt:number = 0;

    constructor() {
        for (let i=0;i<10;i++)
            this.bikes.push( Object.assign({}, DEFAULT_BIKE_DATA))
        this.reset();
    }

    reset() {
        this.cadence = 0;
        this.slope = 0;
        this.gear = 1;
        this.progNo = 0;
        this.heartrate = 0;
        this.distance = 0;
        this.targetPower = 25;
        this.currentPower = 25;
        this.isPowerMode = false;

        this._timeoutResponse= 0;
        this._simulateNoReponseCnt = 0
        this._simulateIllegalResponseCnt = 0;
    
    }

    simulateTimeout(ms:number) {
        this._timeoutResponse = ms;
    }

    simulateNoResponse(cnt=1) {
        this._simulateNoReponseCnt+=cnt;
    }

    simulateIllegalResponse(cnt=1) {
        this._simulateIllegalResponseCnt+=cnt;
    }

    isPedalling() {
        if (this.cadence && this.cadence>0)
            return 1
        return 0
    }


}




export class DaumClassicMockBinding extends MockPortBinding {

    prevCommand: Buffer
    simulator: DaumClassicSimulator;
    handlers: Map<number,(payload:Buffer)=>void>
    


    constructor(parent:MockPortBinding) {
        super(parent.port,parent.openOptions)

        this.prevCommand = null;

        this.simulator = DaumClassicMockImpl.getInstance().getSimulator( this.getPath() )
        if (!this.simulator) {
            this.simulator = new DaumClassicSimulator()
            DaumClassicMockImpl.getInstance().setSimulator( this.getPath(),this.simulator )
        }

        this.initHandlers()
        


        
    }

    getPath():string {
        return this.port.info.path;
    } 

    initHandlers() {
        this.handlers = new Map<number,(payload:Buffer)=>void>()
        
        this.handlers.set(0x10, this.onCheckCockpit.bind(this))
        this.handlers.set(0x11, this.onGetAddress.bind(this))
        this.handlers.set(0x73, this.onGetVersion.bind(this))
        this.handlers.set(0x12, this.onResetDevice.bind(this))
        this.handlers.set(0x21, this.onStartProg.bind(this))
        this.handlers.set(0x22, this.onStopProg.bind(this))
        this.handlers.set(0x23, this.onSetProg.bind(this))
        this.handlers.set(0x69, this.onSetBikeType.bind(this))
        this.handlers.set(0x24, this.onSetPerson.bind(this))
        this.handlers.set(0x40, this.onRunData.bind(this))
        this.handlers.set(0x53, this.onSetGear.bind(this))
        this.handlers.set(0x51, this.onSetPower.bind(this))
        this.handlers.set(0x55, this.onSetSlope.bind(this))

    }


    async write(buffer: Buffer): Promise<void>  {

        if (!Buffer.isBuffer(buffer)) {
            throw new TypeError('"buffer" is not a Buffer')
          }
      
          if (!this.isOpen || !this.port) {
            throw new Error('Port is not open')
          }
      
          if (this.writeOperation) {
            throw new Error('Overlapping writes are not supported and should be queued by the serialport object')
          }

          if (buffer.length==0)                
              return;

          this.writeOperation = (async () => {
            await resolveNextTick()
            if (!this.isOpen || !this.port) {
              throw new Error('Write canceled')
            }

            try {
                const cmd = buffer.readUInt8(0)            
                const handler = this.handlers.get(cmd)
                const payload = buffer.subarray(1)

                if (this.simulator._simulateNoReponseCnt>0) {
                    this.simulator._simulateNoReponseCnt--;
                    return;
                }

                const to = this.simulator._timeoutResponse || 5
                if (handler)
                    //handler(payload)
                    setTimeout( ()=>{handler(payload)},to )
    
            }
            catch(err) {               
            }
            this.writeOperation = null
            
          })()
          return this.writeOperation        
    }
 


    emitData(data: string | Buffer): void {
        if (!this.isOpen || !this.port)
            return
        super.emitData(data)
    }

    onCheckCockpit(payload:Buffer):void {
        const bikeNo = payload.readUInt8(0)
        if (bikeNo>=0 && bikeNo<10) {
            const response = Buffer.from( [0x10,bikeNo,this.simulator.bikes[bikeNo].cockpitVersion])
            this.emitData(response)
        }
    }

    onGetAddress(_payload:Buffer):void { 
        const response = Buffer.from( [0x11,this.simulator.selectedBike])
        this.emitData(response)
    }

    onGetVersion(payload:Buffer):void {
        const bikeNo = payload.readUInt8(0)
        if (bikeNo>=0 && bikeNo<10) {
            const {cockpitType,serialNo} = this.simulator.bikes[bikeNo] || {}
            const response = Buffer.from( [0x73,bikeNo,0,0,0,0,0,0,0,0,cockpitType])
            for ( let i=0;i<serialNo.length && i<8;i++)
                response.writeUInt8( serialNo.charCodeAt(i), i+2)
            this.emitData(response)
        }
    }

    onResetDevice(payload:Buffer):void {
        const bikeNo = payload.readUInt8(0)
        if (bikeNo>=0 && bikeNo<10) {
            const response = Buffer.from( [0x12,bikeNo])

            this.simulator.bikes[bikeNo] = DEFAULT_BIKE_DATA
            this.emitData(response)
        }
    }

    onStartProg(payload:Buffer):void {
        const bikeNo = payload.readUInt8(0)
        if (bikeNo>=0 && bikeNo<10) {
            const isPedalling = this.simulator.isPedalling()

            const response = Buffer.from( [0x21,bikeNo, isPedalling ? 1:0])
            this.emitData(response)
        }
    }


    onStopProg(payload:Buffer):void {
        const bikeNo = payload.readUInt8(0)
        if (bikeNo>=0 && bikeNo<10) {
            const isPedalling = this.simulator.isPedalling()

            const response = Buffer.from( [0x22,bikeNo, isPedalling])
            this.emitData(response)
        }
    }

    onSetProg(payload:Buffer):void {
        const bikeNo = payload.readUInt8(0)
        const progNo = payload.readUInt8(1)

        if (bikeNo>=0 && bikeNo<10) {
            const isPedalling = this.simulator.isPedalling()
            this.simulator.progNo = progNo
            const response = Buffer.from( [0x23,bikeNo,progNo, isPedalling])
            this.emitData(response)
        }
    }

    onSetBikeType(payload:Buffer):void {
        const bikeNo = payload.readUInt8(0)
        const bikeType = payload.readUInt8(3)
        if (bikeNo>=0 && bikeNo<10) {
            const {isPedalling} = this.simulator.bikes[bikeNo]
            this.simulator.bikes[bikeNo].bikeType = bikeType
            

            const response = Buffer.from( [0x69,bikeNo, bikeType])
            this.emitData(response)
        }
    }

    onSetPerson(payload:Buffer):void { 
        const bikeNo = payload.readUInt8(0)
        const personNo = payload.readUInt8(1)
        const age = payload.readUInt8(2)
        const sex = payload.readUInt8(3)
        const length = payload.readUint8(4)
        const weight = payload.readUint8(5)
        const pctFat = payload.readUint8(6)
        const coachingLevel = payload.readUint8(7)
        const coachingFrequency = payload.readUint8(8)
        const powerLimit = payload.readUint8(9)
        const hrLimit = payload.readUint8(10)
        const timeLimit = payload.readUint8(11)
        const distLimit = payload.readUint8(12)
        const kcalLimit = payload.readUint8(13)


        if (bikeNo>=0 && bikeNo<10) {
            this.simulator.bikes[bikeNo].person = {
                personNo, age,sex,length,weight, pctFat, 
                coachingLevel,coachingFrequency,powerLimit, 
                hrLimit, timeLimit, distLimit, kcalLimit}
            
            const isPedalling = this.simulator.isPedalling()
            
            let response 
            if (this.simulator._simulateIllegalResponseCnt>0) {
                response = Buffer.from( [0x24,bikeNo, personNo, age, sex,
                    length, weight, pctFat, coachingLevel, coachingFrequency,
                    powerLimit+10, hrLimit, timeLimit,distLimit, kcalLimit, 
                    isPedalling])

            }
            else {
                response = Buffer.from( [0x24,bikeNo, personNo, age, sex,
                    length, weight, pctFat, coachingLevel, coachingFrequency,
                    powerLimit, hrLimit, timeLimit,distLimit, kcalLimit, 
                    isPedalling])
    
            }
            this.emitData(response)
        }
    }

    onRunData(payload:Buffer):void { 
        const {cadence,gear,slope,heartrate,distance,progNo,isPowerMode,currentPower} = this.simulator
        const bike = this.simulator.bikes[this.simulator.selectedBike]
        const {person,bikeType} = bike
        const {personNo,weight} = person

        const bikeNo = payload.readUInt8(0)
        const isPedalling = this.simulator.isPedalling()+128

        let speed,power;

        speed = calc.calculateSpeedDaum(gear,cadence,bikeType)        
        if (isPowerMode) {
            power = currentPower
        }
        else {
            power = calc.calculatePower(weight+10, speed/3.6,slope,{bikeType})
        }

        if (power<25) 
            power = 25
        if (cadence===0)
            power = 0;
        power = Math.round(power/5)

        const dist1 = distance/1000-Math.floor(distance/1000/256) 
        const dist2 = Math.floor(distance/1000/256)
        
        if (bikeNo>=0 && bikeNo<10) {
            const response = Buffer.from( [0x40,bikeNo, progNo,personNo,
                isPedalling, power, cadence, Math.floor(speed),
                dist1, dist2,0,0,0,0,  heartrate,0, gear,0,0
            ])
            this.emitData(response)
        }
    }

    onSetGear(payload:Buffer):void {
        const bikeNo = payload.readUInt8(0)
        const gear = payload.readUInt8(1)
        if (bikeNo>=0 && bikeNo<10) {            
            this.simulator.gear = gear
            const response = Buffer.from( [0x53,bikeNo, gear])
            this.emitData(response)
        }
    }

    onSetPower(payload:Buffer):void {
        const bikeNo = payload.readUInt8(0)
        const power = payload.readUInt8(1)
        if (bikeNo>=0 && bikeNo<10) {            
            this.simulator.targetPower = power
            this.simulator.isPowerMode = true
            setTimeout( ()=>{this.simulator.currentPower = power}, 1000 )

            const response = Buffer.from( [0x51,bikeNo, power])
            this.emitData(response)
        }
    }

    onSetSlope(payload:Buffer):void {
        
        const bike = this.simulator.bikes[this.simulator.selectedBike]
        const {person} = bike
        const {personNo} = person
        const {currentPower,cadence} = this.simulator
        
        const bikeNo = payload.readUInt8(0)
        const slope = payload.readFloatLE(1)



        const retVal0 = payload.readUInt8(1)
        const isPedalling = this.simulator.isPedalling()+128
        
        const power = cadence>0 ? Math.floor(currentPower/5) : 0
        
        if (bikeNo>=0 && bikeNo<10) {            
            this.simulator.slope = slope
            this.simulator.isPowerMode = false;

            const response = Buffer.from( [0x55,bikeNo,retVal0,personNo, isPedalling, power ])
            this.emitData(response)
        }
    }

}
