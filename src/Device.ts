/* istanbul ignore file */

import DeviceProtocol from './DeviceProtocol'

export default class Device {

    protocol: DeviceProtocol;
    detected: boolean;
    selected: boolean;
    onDataFn: any; //(data)=>void;

    constructor( proto) {
        this.protocol= proto;
        this.detected = false;
        this.selected = false;
        this.onDataFn = undefined;
    }

    isBike() {}
    isPower() {}
    isHrm() {}
    
    getID() {}
    getDisplayName() { return this.getName() }
    getName() {}
    getPort() {}
    getProtocol() {
        return this.protocol;
    }
    getProtocolName() {
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
    
    onData( callback) {
        this.onDataFn = callback;
    }

}