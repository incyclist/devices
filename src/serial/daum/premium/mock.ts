import {MockBindingInterface, MockPortBinding,CreatePortOptions, MockBinding,MockPortInternal} from '@serialport/binding-mock'
import { BindingInterface, BindingPortInterface, PortStatus, SetOptions, UpdateOptions, OpenOptions, PortInfo } from '@serialport/bindings-interface'
import { SerialInterface, SerialPortProvider } from '../../';
import { Gender, User } from '../../../types/user';
import { sleep,resolveNextTick } from '../../../utils/utils';
import { ACTUAL_BIKE_TYPE } from '../constants';
import { bin2esc, buildMessage, checkSum, esc2bin, parsePersonData, ReservedCommands } from './utils';

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


    _isSimulateACKTimeout: boolean = false;
    _isSimulateCheckSumError: boolean = false;
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

    onNAK() {}
    onACK() {}

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
            if (!this.isOpen || !this.port) {
              throw new Error('Write canceled')
            }

            if (this.simulator._isSimulateACKTimeout) {
                this.simulator._isSimulateACKTimeout = false;                
            }
            else {
                
                setTimeout( ()=>{this.processData(buffer)},5 )
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
                    const to = this.simulator.timeoutNAKRetry || 1000;
                    setTimeout( ()=>{
                        this.emitData(this.prevCommand)
                        this.waitingForCommand = false;
                        this.waitingForAck = true;
    
                    }, to)
                }
                    
            }
        }
        
    }

    createResponse( cmd:string, payload:Buffer): Buffer {
        const buffer = Buffer.from(buildMessage( cmd, payload))

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
            setTimeout( ()=>{this.simulator.currentPower=power}, 1000)
        }
        this.emitData( this.createResponse( 'S23', Buffer.from( this.simulator.power.toString()) ))

    }

    onReservedCommand(payload:Buffer) {
        const cmd = payload.readInt16LE(0)
        const length = payload.readUint16LE(2)
        const data = esc2bin(payload.subarray(4,4+length-1))

        switch(cmd) {
            case ReservedCommands.PERSON_SET: this.onPersonSet(Buffer.from(data))
            case ReservedCommands.PERSON_GET: this.onPersonGet()       
        }
    }

    onPersonSet(payload:Buffer) {
        this.simulator.person = parsePersonData(payload)
        this.emitData(this.createResponse( 'M70', Buffer.from('07000000','hex' ) ))
    }

    onPersonGet() {


    }

    onGetTrainingData(_payload:Buffer) {
        
    }

}

