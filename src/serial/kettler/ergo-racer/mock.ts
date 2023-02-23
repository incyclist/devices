import {MockBindingInterface, MockPortBinding,CreatePortOptions, MockBinding,MockPortInternal} from '@serialport/binding-mock'
import { SerialInterface, SerialPortProvider } from '../..';
import { BindingInterface, BindingPortInterface, PortStatus, SetOptions, UpdateOptions, OpenOptions, PortInfo } from '@serialport/bindings-interface'
import { sleep,resolveNextTick } from '../../../utils/utils';
import { Gender, User } from '../../../types/user';

const CRLF = '\r\n'; 

export type MockProps = {
    interface: string;
    path: string;
}
export interface KettlerRacerMockBindingInterface extends BindingInterface<KettlerRacerMockBinding> {
    reset(): void
    createPort(path: string, opt?: CreatePortOptions): void
}

function pad(num:number, size:number):string {
    let str = Math.round(num).toString();
    while (str.length < size) str = "0" + str;
    return str;
}

// Mock towards SerialPort library
// This needs to be registered to the SerialPortProvider
export const KettlerRacerMock : MockBindingInterface = {
    reset() {
        KettlerRacerMockImpl.getInstance().reset()
    }, 
    createPort(path: string, options: CreatePortOptions = {}) {
        return KettlerRacerMockImpl.getInstance().createPort(path,options)
    },
    async list() {
        return KettlerRacerMockImpl.getInstance().list()
    },
    async open(options) {
        return KettlerRacerMockImpl.getInstance().open(options)
    }
}

export class KettlerRacerMockImpl  {

    static _instance: KettlerRacerMockImpl;
   
    static getInstance():KettlerRacerMockImpl {
        if (!KettlerRacerMockImpl._instance)
            KettlerRacerMockImpl._instance = new KettlerRacerMockImpl()
        return KettlerRacerMockImpl._instance;
    }

    static reset() {
        KettlerRacerMockImpl._instance = undefined;
        SerialPortProvider._instance = undefined
        SerialInterface._instances = [];
    }

    simulators: Map<string,KettlerRacerSimulator>
    ports: {path:string, binding:KettlerRacerMockBinding}[]

    constructor() {
        this.simulators = new Map<string,KettlerRacerSimulator>();
        this.ports = [];
    }

    setSimulator( path:string, simulator:KettlerRacerSimulator ) {
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
        return new KettlerRacerMockBinding(port);
    }




}

export class KettlerRacerSimulator {

    identifier: string = 'SDFB3129'
    version: string = '131'

    bikeType: string = 'SDJB'
    ifVersion: string = 'E5'


    power: number = 0;
    requestedPower: number = 0;
    person: User = { weight:75, length:180, age:30, sex:Gender.MALE } ;
    cadence:number =0;
    distance:number=0; 
    speed:number=0;
    heartrate:number=0;
    time:number=4; 
    energy:number =0
}


export class KettlerRacerMockBinding extends MockPortBinding {

    waitingForCommand: boolean;
    waitingForAck: boolean;
    prevCommand: Buffer
    simulator: KettlerRacerSimulator;
    handlers: Map<string,(payload:string)=>void>


    constructor(parent:MockPortBinding) {
        super(parent.port,parent.openOptions)


        this.simulator = KettlerRacerMockImpl.getInstance().getSimulator( this.getPath() )
        if (!this.simulator) {
            this.simulator = new KettlerRacerSimulator()
            KettlerRacerMockImpl.getInstance().setSimulator( this.getPath(),this.simulator )
        }

        this.initHandlers()
    }

    getPath():string {
        return this.port.info.path;
    } 

    initHandlers() {
        this.handlers = new Map<string,(payload:string)=>void>()
        this.handlers.set('CP', this.onSetComputerMode.bind(this))
        this.handlers.set('CM', this.onSetClientMode.bind(this))
        this.handlers.set('RS', this.onReset.bind(this))
        this.handlers.set('ID', this.onGetIdentifier.bind(this))
        this.handlers.set('VE', this.onGetVersion.bind(this))
        this.handlers.set('KI', this.onGetKettlerInfo.bind(this))
        this.handlers.set('PW', this.onSetPower.bind(this))
        this.handlers.set('ST', this.onGetStatus.bind(this))
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

                
            setTimeout( ()=>{this.processData(buffer)},5 )


            this.writeOperation = null
            
          })()
          return this.writeOperation        
    }

    async processData(buffer: Buffer) { 

        
        // simplified model
        const data = buffer.toString()
        const lines = data.split(CRLF)
        lines.forEach( line => {
            let payload;
            let cmd = line.substring(0,2)
            if (cmd==='ES') {
                cmd = line.substring(0,3)
                payload = line.substring(3)
            }
            else {
                payload = line.substring(2)
            }

            if(!cmd || cmd.length===0)
                return;

            const handler = this.handlers.get(cmd)
            if (handler) {
                handler(payload)
            }
            else {
                this,this.emitData('ERROR'+CRLF)
            }
            
        })


    }

    onSetComputerMode(_payload:string) {
        this.sendResponse('ACK')
    }

    onSetClientMode(_payload:string) {
        this.sendResponse('ACK')
    }

    onReset(_payload:string) {
        this.sendResponse('ACK')
    }
    onGetIdentifier(_payload:string) {
        this.sendResponse(this.simulator.identifier)
    }
    onGetVersion(_payload:string) {
        this.sendResponse(this.simulator.version)
    }
    onGetKettlerInfo(_payload:string) {
        const {bikeType,ifVersion} = this.simulator
        this.sendResponse(`${bikeType}\t${ifVersion}`)
    }

    onSetPower(payload:string) {
        this.simulator.requestedPower = Number(payload)
        setTimeout(()=>{ this.simulator.power=this.simulator.requestedPower}, 1000)

        this.onGetStatus()
    }

    onGetStatus() {
        const {heartrate,cadence,speed,distance,power,energy,time,requestedPower} = this.simulator

        const mins = time%60;
        const secs = time-mins*60;

        const data = []
        data.push( pad(heartrate,3))
        data.push( pad(cadence,3))
        data.push( pad(speed*10,3))
        data.push( pad(distance,3))
        data.push( pad(power,3))
        data.push( pad(energy,3))
        data.push( pad(mins,2)+':'+pad(secs,2))
        data.push( pad(requestedPower,3))
        const response = data.join('\t')       

        this.sendResponse(response)

    }

    sendResponse(msg:string) {
        this.emitData(msg+CRLF)
    }

    

}

