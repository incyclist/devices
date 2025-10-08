import { Characteristic } from "./characteristic.js";
import { TValue } from "../types.js";



type Handler = (_data: Buffer)=> number

export class ZwiftPlayControlPointCharacteristic extends  Characteristic<TValue> {

    protected hasControl: boolean;
    protected isStarted: boolean;
    //protected fmsc: any // FitnessMachineStatusCharacteristic;
    protected targetPower: number;  
    protected handlers: Record<number, Handler> = {};

    constructor( ) {
        super({
            uuid: '00000003-19ca-4651-86e5-fa29dcdd09d1',
            value: null,
            properties: ['write'],
            descriptors: []
        });

    this.hasControl = false;
    this.isStarted = false;
    this.targetPower = 0;

    }
  

    write(data: Buffer, offset: number, withoutResponse: boolean, callback: (success: boolean, response?: Buffer) => void): void { 
        // first byte indicates opcode

        console.log('# incoming zwift-play:control message:', Buffer.from(data).toString('hex'))
        if (withoutResponse)
            callback(true);
        else
            callback(true,Buffer.from([]));

        /*
        const code = data.readUInt8(0);
        const ResponseCode = 0x80;
        let result

        const handler = this.handlers[code];
        if (handler) {
            result = handler(data);
        }
        else {
            console.log(this.description,'Unsupported OPCODE:' + code);
            result = OpCodeNotSupported
        }

        const buffer = Buffer.alloc(3);
        buffer.writeUInt8(ResponseCode);
        buffer.writeUInt8(code, 1);
        buffer.writeUInt8(result, 2);

        // when would it not be successful?
        if (withoutResponse)
            callback(true);
        else
            callback(true,buffer);
        */
    }
    

};
