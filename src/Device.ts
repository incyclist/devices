/* istanbul ignore file */

import {DeviceProtocol,Device} from './DeviceProtocol'

type DeviceAdapterProps = {}
export type OnDeviceDataCallback = ( data:any ) => void;


export interface DeviceAdapter extends Device {
    isBike(): boolean 
    isPower(): boolean
    isHrm(): boolean

    getID(): string
    getDisplayName(): string
    getName(): string
    getPort(): string
    getProtocol(): DeviceProtocol
    getProtocolName(): string

    setIgnoreHrm(ignore: boolean): void 
    setIgnorePower(ignore:boolean): void 
    setIgnoreBike(ignore:boolean): void 

    select(): void
    unselect(): void 
    isSelected(): boolean
    
    setDetected( detected?:boolean): void
    isDetected(): boolean
    
    start( props?: any ): Promise<any> 
    stop(): Promise<boolean> 
    pause(): Promise<boolean> 
    resume(): Promise<boolean> 

    sendUpdate(request): void
    onData( callback: OnDeviceDataCallback): void
}

/**
    * DeviceAdapterBase
    * 
    * Serves as base implementation class for Device Adapters
    * 
    * 
*/

export default class DeviceAdapterBase implements DeviceAdapter {

    protocol: DeviceProtocol;
    detected: boolean;
    selected: boolean;
    onDataFn: OnDeviceDataCallback;

    /**
        * @param {DeviceProtocol} proto The DeviceProtocol implementation that should be used to detect this type of device
    */
    constructor( proto: DeviceProtocol) {
        this.protocol= proto;
        this.detected = false;
        this.selected = false;
        this.onDataFn = undefined;
    }

    isBike():boolean {throw new Error('not implemented')}
    isPower():boolean {throw new Error('not implemented')}
    isHrm():boolean {throw new Error('not implemented')}

    getID():string { throw new Error('not implemented')}
    getDisplayName():string { return this.getName() }
    getName():string { throw new Error('not implemented')}
    getPort():string {throw new Error('not implemented')}
    getProtocol():DeviceProtocol {return this.protocol; }
    getProtocolName(): string| undefined {
        return this.protocol ? this.protocol.getName() : undefined;
    }

    setIgnoreHrm(ignore) {}
    setIgnorePower(ignore) {}
    setIgnoreBike(ignore) {}

    select() { this.selected = true;}
    unselect() {this.selected = false;} 
    isSelected() { return this.selected} 
    setDetected( detected=true) { this.detected=detected}
    isDetected() {return this.detected}

    update() {}
    check() {}
    connect() {}
    close() {}
    
    start( props?: any ): Promise<any> {throw new Error('not implemented')}
    stop(): Promise<boolean> { throw new Error('not implemented')}
    pause(): Promise<boolean> { throw new Error('not implemented')}
    resume(): Promise<boolean> { throw new Error('not implemented')}

    sendUpdate(request) {}   
    onData( callback: OnDeviceDataCallback ) {
        this.onDataFn = callback;
    }

}