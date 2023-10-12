/* istanbul ignore file */

export default abstract class DaumSerialComms {
    serial

    abstract getPort():string
    abstract pauseLogging():void
    abstract resumeLogging():void
    abstract isConnected():boolean
    abstract connect():Promise<boolean>
    abstract close():Promise<boolean>

    
    abstract setTargetSlope(slope:number):Promise<void>
    abstract setTargetPower(power:number):Promise<void>


    
}