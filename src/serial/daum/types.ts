export abstract class DaumSerialComms {
    serial

    abstract getPort():string
    abstract pause():void
    abstract resume():void
    abstract isConnected():boolean
    abstract connect():Promise<boolean>
    abstract close():Promise<boolean>

    
    abstract setTargetSlope(slope:number):Promise<void>
    abstract setTargetPower(power:number):Promise<void>
    abstract setTargetGear(gear:number):Promise<void>


    
}

export class ResponseTimeout extends Error {
    constructor() {
        super();
        this.message = 'RESP timeout';
    }
}


