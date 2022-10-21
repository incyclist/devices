import { EventLogger } from "gd-eventlog";
import DeviceProtocolBase, { DeviceProtocol, DeviceSettings, INTERFACE, ScanProps } from "../protocol";
import DeviceRegistry from "../registry";
import AdapterFactory from "./adapter-factory";

import AntDeviceBinding from './ant-binding'
import AntAdapter from "./ant-device";
import AntInterface from "./ant-interface";

export const mapAntProfile = (antProfile) => {
    switch (antProfile) {
        case 'HR': return 'Heartrate Monitor'
        case 'PWR': return 'Power Meter'
        case 'FE': return 'Smart Trainer'
    }
}

export const mapIncyclistProfile = (incyclistProfile) => {
    switch (incyclistProfile) {
        case 'Heartrate Monitor': return 'HR'
        case 'Power Meter': return 'PWR'
        case 'Smart Trainer': return 'FE'
    }
}

export interface AntDeviceSettings extends DeviceSettings {
    deviceID?: string;
    profile: string;
}

export interface AntScanProps extends ScanProps {
    timeout?: number;
    profiles?: string []
}

export interface AntScannerProps  {
    timeout?: number;
    profiles?: string []
}

export default class AntProtocol extends DeviceProtocolBase implements DeviceProtocol {
    
    
    logger: EventLogger;
    ant: AntInterface;
    binding: typeof AntDeviceBinding
    

    // delayed instantiation - this is required, as AntProtocol constructor will be called upon import of this module
    getAnt() {

        if (this.ant)
            return this.ant
        
        this.ant = AntInterface.getInstance( )
        this.logger = new EventLogger('Ant+');

        return this.ant;
    }

    constructor() {
        super();
    }

    logEvent(event) {
        if (!this.logger)
            this.logger = new EventLogger('Ant+');

        if (this.logger)
            this.logger.logEvent(event)
    }


    async scan( props: AntScanProps ):Promise<void> {
        const {id,onDeviceFound,onScanFinished} = props || {};

        const ant = this.getAnt();
        ant.on('detected',(profile:string,deviceID:number)=>{
            console.log('detected',profile,deviceID)
            if (onDeviceFound) {
                const detected = {profile,deviceID};
                const device = AdapterFactory.create( {detected},this)
                onDeviceFound(device,this);
            }            
        })
        this.logEvent({message:'scan'})
        
        await ant.scan(props)
        if (onScanFinished) {
            onScanFinished(id);
        }
    }

    async stopScan(): Promise<void>  {
        const ant = this.getAnt();
        await ant.stopScan()
    }

    isScanning(): boolean {
        const ant = this.getAnt();
        return ant.isScanning()
    } 

    createDevice( request: AntDeviceSettings | AntAdapter) {
        const fromAdapter = request instanceof AntAdapter;

        let device:AntAdapter=undefined
        if (fromAdapter) 
            device = request;
        else {
            
            device = AdapterFactory.create( {configuration:request},this)
        }
        return device;
    }

    add(settings: AntDeviceSettings) { 
        this.logEvent( {message:'adding device',settings})
        const device = this.createDevice(settings);        
        this.devices.push(device)
        return device;
    }
    
    getName(): string { return 'Ant'}
    getInterfaces(): Array<string> { return [INTERFACE.ANT]}
    isBike(): boolean { return true;}
    isHrm(): boolean { return true;}
    isPower(): boolean { return true;}
    
}

DeviceRegistry.register( new AntProtocol() );