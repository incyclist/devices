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
            uuid: '00000003-19ca-4651-86e5-fa29dcdd09d1'.toUpperCase(),
            value: null,
            properties: ['write'],
            descriptors: []
        });

    this.hasControl = false;
    this.isStarted = false;
    this.targetPower = 0;

    }
  

    write(data: Buffer, offset: number, withoutResponse: boolean, callback: (success: boolean, response?: Buffer) => void): void { 
        const message = Buffer.from(data).toString('hex')

        console.log('# incoming zwift-play:control message:', message)
        if (withoutResponse)
            callback(true);
        else
            callback(true,Buffer.from([]));

        if (message.startsWith('526964654f6e')) {
            console.log('ride on !')
            this.emulator.rideOn()
            
        }

    }
    

};
