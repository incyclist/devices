/* istanbul ignore file */
import {MockBindingInterface, MockPortBinding,CreatePortOptions, MockBinding} from '@serialport/binding-mock'
import { BindingInterface } from '@serialport/bindings-interface'
import { SerialInterface, SerialPortProvider } from '../../';
import { Gender, User } from '../../../types';
import { sleep,resolveNextTick } from '../../../utils/utils';
import { bin2esc, buildMessage, checkSum, esc2bin, parsePersonData, ReservedCommands } from './utils';
import { DS_BITS_ENDLESS_RACE } from './consts';

export type MockProps = {
    interface: string;
    path: string;
}

export interface Daum8iMockBindingInterface extends BindingInterface<Daum8iMockBinding> {
    reset(): void
    createPort(path: string, opt?: CreatePortOptions): void
}

// Mock towards SerialPort library
// This needs to be registered to the SerialPortProvider
export const Daum8iMock : MockBindingInterface = {
    reset() {
        Daum8iMockImpl.getInstance().reset()
    }, 
    createPort(path: string, options: CreatePortOptions = {}) {
        return Daum8iMockImpl.getInstance().createPort(path,options)
    },
    async list() {
        return Daum8iMockImpl.getInstance().list()
    },
    async open(options) {
        return Daum8iMockImpl.getInstance().open(options)
    }
}

export class Daum8iMockImpl  {

    static _instance: Daum8iMockImpl;
   
    static getInstance():Daum8iMockImpl {
        if (!Daum8iMockImpl._instance)
            Daum8iMockImpl._instance = new Daum8iMockImpl()
        return Daum8iMockImpl._instance;
    }

    static reset() {
        Daum8iMockImpl._instance = undefined;
        SerialPortProvider._instance = undefined
        SerialInterface._instances = [];
    }

    simulators: Map<string,Daum8MockSimulator>
    ports: {path:string, binding:Daum8iMockBinding}[]

    constructor() {
        this.simulators = new Map<string,Daum8MockSimulator>();
        this.ports = [];
    }

    setSimulator( path:string, simulator:Daum8MockSimulator ) {
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
        return new Daum8iMockBinding(port);
    }




}

type Program = {
    lapMode: boolean
    id?:number
    started?:boolean
}

type trainingData = {
    time: number,
    heartrate: number,
    v: number
    slope: number,
    distanceInternal: number
    pedalRpm: number
    power: number
    physEnergy: number
    realEnergy: number
    torque: number
    gear:  number
    deviceState: number
    speedStatus: number
}

const DEFAULT_TRAINING_DATA = {
    time: 0,
    heartrate: 0,
    v: 0,
    slope: 0,
    distanceInternal: 0,
    pedalRpm: 0,
    power: 0,
    physEnergy: 0,
    realEnergy: 0,
    torque: 0,
    gear:  10,
    deviceState: 1, // device ON
    speedStatus: 0  // speed OK 
}

export class Daum8MockSimulator {

    protoVersion: string = '201';
    dashboardVersion: string = 'Version 1.380'
    deviceType: number = 0;
    actualType: number = 0;
    gear: number = 10;
    power: number = 0;
    currentPower: number = 0;
    loadControl:number = 1;
    person: User = { weight:75, length:180, age:30, sex:Gender.MALE } ;
    program: Program
    data: trainingData = DEFAULT_TRAINING_DATA
    openHandles: Array<NodeJS.Timeout> = []

    _isSimulateACKTimeout: boolean = false;
    _isSimulateCheckSumError: boolean = false;
    _isSimulateReservedError: boolean = false;
    _timeoutResponse: number = 0;
    timeoutNAKRetry = 1000;

    simulateACKTimeout() {
        this._isSimulateACKTimeout = true;
    }

    simulateTimeout(ms:number) {
        this._timeoutResponse = ms;
    }

    simulateChecksumError() {
        this._isSimulateCheckSumError = true;
    }
    simulateReservedError() {
        this._isSimulateReservedError = true;
    }

    onNAK() {}
    onACK() {}

    addHandle(handle:NodeJS.Timeout) {
        this.openHandles.push(handle)
    }

    cleanup() {
        this.openHandles.forEach( to => {clearTimeout(to)})
    }



}

export function parseProgramListNewData(buffer:Buffer) : Program {
    const wBits = buffer.readInt16LE( 30)
    const lapMode = wBits===DS_BITS_ENDLESS_RACE
    return { lapMode}

}




export class Daum8iMockBinding extends MockPortBinding {

    waitingForCommand: boolean;
    waitingForAck: boolean;
    prevCommand: Buffer
    simulator: Daum8MockSimulator;
    handlers: Map<string,(payload:Buffer)=>void>


    constructor(parent:MockPortBinding) {
        super(parent.port,parent.openOptions)

        this.waitingForAck = false;
        this.waitingForCommand = true;
        this.prevCommand = null;

        this.simulator = Daum8iMockImpl.getInstance().getSimulator( this.getPath() )
        if (!this.simulator) {
            this.simulator = new Daum8MockSimulator()
            Daum8iMockImpl.getInstance().setSimulator( this.getPath(),this.simulator )
        }

        this.initHandlers()
        


        
    }

    getPath():string {
        return this.port.info.path;
    } 

    initHandlers() {
        this.handlers = new Map<string,(payload:Buffer)=>void>()
        
        this.handlers.set('V00', this.onGetProtcolVersion.bind(this))
        this.handlers.set('V70', this.onGetDashboardVersion.bind(this))
        this.handlers.set('Y00', this.onGetDeviceType.bind(this))
        this.handlers.set('M72', this.onActualDeviceType.bind(this))
        this.handlers.set('M71', this.onGear.bind(this))
        this.handlers.set('S20', this.onLoadControl.bind(this))
        this.handlers.set('S23', this.onPower.bind(this))
        this.handlers.set('M70', this.onReservedCommand.bind(this))
        this.handlers.set('X70', this.onGetTrainingData.bind(this))
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


          this.writeOperation = (async () => {
            await resolveNextTick()
            /*
            if (!this.isOpen || !this.port) {
              throw new Error('Write canceled')
            }
            */

            if (this.simulator._isSimulateACKTimeout) {
                this.simulator._isSimulateACKTimeout = false;                
            }
            else {
                
                const to = setTimeout( ()=>{this.processData(buffer)},5 )
                this.simulator.addHandle(to)
            }



            this.writeOperation = null
            
          })()
          return this.writeOperation        
    }

    async processData(buffer: Buffer) {
        
        if (this.waitingForCommand) {
            try {

                const str = buffer.toString('hex')
                if (str.startsWith('01') && str.endsWith('17')) {


                    const cmd = buffer.subarray(1,4).toString()
                    const payload = buffer.subarray(4,buffer.length-3)
                    const checksumVal = buffer.subarray(buffer.length-3,buffer.length-1).toString()
                    const check = checkSum(buffer.subarray(1,4),payload)
                    const handler = this.handlers.get(cmd)
                    

                    if (checksumVal===check && handler) {
                        // send ACK
                        this.emitData( Buffer.from([0x06]))
                        this.waitingForCommand=true

                        const to = this.simulator._timeoutResponse;
                        if (to) {
                            await sleep(to)
                            this.simulator._timeoutResponse = 0 ;
                        }

                        handler(payload)
                        this.waitingForCommand = false;
                        this.waitingForAck=true

                    }
                    else {
                        // send NAK
                        this.emitData( Buffer.from([0x15]))
                        this.waitingForAck=false
                        this.waitingForCommand = true;

                    }



                }
                else {
                    // send NAK
                    this.emitData( Buffer.from([0x15]))
                    this.waitingForAck=false
                    this.waitingForCommand = true;
                }


            }
            catch(err) {
                //console.log('~~~ERROR',err)
            }

        }
        else if ( this.waitingForAck) {

            const c= buffer.readUInt8(0)
            if (c===0x06 /*ACK*/) {

                this.simulator.onACK()
                this.waitingForAck = false;
                this.waitingForCommand=true
                this.prevCommand = null;
            }
            else if (c===0x15 /*NAK*/ ) {
                this.simulator.onNAK()
                // resend previous command
                if (this.prevCommand) {
                    const toVal = this.simulator.timeoutNAKRetry || 1000;
                    const to = setTimeout( ()=>{
                        this.emitData(this.prevCommand)
                        this.waitingForCommand = false;
                        this.waitingForAck = true;
    
                    }, toVal)
                    this.simulator.addHandle(to)
                }
                    
            }
        }
        
    }

    createResponse( cmd:string, payload:Buffer,binary=false): Buffer {
        let buffer;

        if (binary) {
            buffer = Buffer.from(buildMessage( cmd, bin2esc(payload)))
        }
        else  {
            buffer = Buffer.from(buildMessage( cmd, payload))
        }

        this.prevCommand = Buffer.from(buffer)

        if (this.simulator._isSimulateCheckSumError) {
            this.simulator._isSimulateCheckSumError = false;
            buffer[ buffer.length-2] = buffer[ buffer.length-2]-1
        }

        return buffer;
    }

    emitData(data: string | Buffer): void {
        if (!this.isOpen || !this.port)
            return
        super.emitData(data)
    }

    onGetProtcolVersion(_payload:Buffer) {
        this.emitData( this.createResponse('V00', Buffer.from( this.simulator.protoVersion)))
    }

    onGetDashboardVersion(_payload:Buffer) {
       
        this.emitData( this.createResponse( 'V70', Buffer.from( this.simulator.dashboardVersion) ))
    }

    onGetDeviceType(_payload:Buffer) {       
        this.emitData( this.createResponse( 'Y00', Buffer.from( this.simulator.deviceType.toString()) ))
    }

    onActualDeviceType(payload:Buffer) {       
        if (payload.length>0) {
            this.simulator.actualType = Number(payload.toString())
        }
        this.emitData( this.createResponse( 'M72', Buffer.from( this.simulator.actualType.toString()) ))
    }

    onLoadControl(payload:Buffer) {  
        if (payload.length>0) {            
            const loadControl = Number(payload.toString())
            this.simulator.loadControl = loadControl
        }
        this.emitData( this.createResponse( 'S20', Buffer.from( this.simulator.loadControl.toString()) ))
    }


    onGear(payload:Buffer) {    
        if (payload.length>0) {
            const gear  = Number(payload.toString())
            this.simulator.gear = gear;    
        }
        this.emitData( this.createResponse( 'M71', Buffer.from( this.simulator.gear.toString()) ))
    }

    onPower(payload:Buffer) {  
        if (payload.length>0) {            
            const power = Number(payload.toString())
            this.simulator.power = power;            
            // it takes a while until the bike has adjusted - this simulates the behaviour
            const to = setTimeout( ()=>{this.simulator.currentPower=power}, 1000)
            this.simulator.addHandle(to)
        }
        this.emitData( this.createResponse( 'S23', Buffer.from( this.simulator.power.toString()) ))

    }

    onReservedCommand(payload:Buffer) {
        const cmd = payload.readInt16LE(0)
        const data = esc2bin(payload.subarray(4,4+payload.length-1))

        switch(cmd) {
            case ReservedCommands.PERSON_SET: this.onPersonSet(Buffer.from(data)); break;
            case ReservedCommands.PERSON_GET: this.onPersonGet(); break;
            case ReservedCommands.PROGRAM_LIST_BEGIN: this.onProgramListBegin(); break;
            case ReservedCommands.PROGRAM_LIST_NEW_PROGRAM: this.onProgramListNewProgram(Buffer.from(data)); break;
            case ReservedCommands.PROGRAM_LIST_CONTINUE_PROGRAM: this.onProgramListContinueProgram(); break;
            case ReservedCommands.PROGRAM_LIST_END: this.onProgramListEnd();break;
            case ReservedCommands.PROGRAM_LIST_START: this.onProgramListStart(Buffer.from(data)); break;
        }
    }

    onPersonSet(payload:Buffer) {
        this.simulator.person = parsePersonData(payload)
        if (this.simulator._isSimulateReservedError) {
            this.emitData(this.createResponse( 'M70', Buffer.from('08000000','hex' ) ))
            this.simulator._isSimulateReservedError=false;
        }
        else 
            this.emitData(this.createResponse( 'M70', Buffer.from('07000000','hex' ),true ))
    }

    onPersonGet() {


    }

    onProgramListBegin() {
        
        if (this.simulator._isSimulateReservedError) {
            this.emitData(this.createResponse( 'M70', Buffer.from('07000000','hex' ),true ))
            this.simulator._isSimulateReservedError=false;
        }
        else 
            this.emitData(this.createResponse( 'M70', Buffer.from('08000000','hex' ),true ))
    }

    onProgramListNewProgram(payload:Buffer) {
        this.simulator.program = parseProgramListNewData(payload)        
        if (this.simulator._isSimulateReservedError) {
            this.emitData(this.createResponse( 'M70', Buffer.from('08000000','hex' ),true ))
            this.simulator._isSimulateReservedError=false;
        }
        else 
            this.emitData(this.createResponse( 'M70', Buffer.from('09000000','hex' ),true ))
    }

    onProgramListEnd() {
        
        if (this.simulator._isSimulateReservedError) {
            this.emitData(this.createResponse( 'M70', Buffer.from('08000000','hex' ),true ))
            this.simulator._isSimulateReservedError=false;
        }
        else 
            this.emitData(this.createResponse( 'M70', Buffer.from('0B00010001','hex' ),true ))
    }

    onProgramListContinueProgram() {
        
        if (this.simulator._isSimulateReservedError) {
            this.emitData(this.createResponse( 'M70', Buffer.from('08000000','hex' ),true ))
            this.simulator._isSimulateReservedError=false;
        }
        else 
            this.emitData(this.createResponse( 'M70', Buffer.from('0A00010001','hex' ),true ))
    }

    onProgramListStart(payload:Buffer) {

        
        if (this.simulator._isSimulateReservedError) {
            this.emitData(this.createResponse( 'M70', Buffer.from('08000000','hex' ),true ))
            this.simulator._isSimulateReservedError=false;
        }
        else {
            try {
                if (!this.simulator.program)
                    this.simulator.program={lapMode:false}
                this.simulator.program.id = payload.readInt16LE(0)
                this.simulator.program.started = true;
            }
            catch(err) {
                console.log('~~~ ERROR',payload, err,payload.toString('hex'))
            }
    
            this.emitData(this.createResponse( 'M70', Buffer.from('0C00000','hex' ),true ))
        }
    }

    onGetTrainingData(_payload:Buffer) {
        const GS = Buffer.from([0x1D]).toString()

        const {
            time,
            heartrate,
            v,
            slope,
            distanceInternal,
            pedalRpm,
            power,
            physEnergy,
            realEnergy,
            torque,
            gear,
            deviceState,
            speedStatus
        } = this.simulator.data

        const res = 
            `${time}`+GS+
            `${heartrate}`+GS+
            `${v}`+GS+
            `${slope}`+GS+
            `${distanceInternal}`+GS+
            `${pedalRpm}`+GS+
            `${power}`+GS+
            `${physEnergy}`+GS+
            `${realEnergy}`+GS+
            `${torque}`+GS+
            `${gear}`+GS+
            `${deviceState}`+GS+
            `${speedStatus}`

        this.emitData( this.createResponse( 'X70', Buffer.from( res )))
    }

}

