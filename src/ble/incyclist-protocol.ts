import { EventLogger } from "gd-eventlog";
import DeviceProtocolBase,{INTERFACE,DeviceProtocol,DeviceSettings, ScanProps, Device} from "../DeviceProtocol";
import DeviceRegistry from "../DeviceRegistry";
import { BleBinding, BleDeviceClass } from "./ble";

import BleInterface from "./ble-interface";
import BleHrmDevice, {HrmAdapter} from "./hrm";
import BleCyclingPowerDevice from "./pwr";

const supportedDeviceTypes = [BleHrmDevice,BleCyclingPowerDevice]

interface BleDeviceSettings extends DeviceSettings {
    id?: string;
    profile: string;
    address?: string;
    protocol: string;
    interface: string;
}


export default class BleProtocol extends DeviceProtocolBase implements DeviceProtocol {
    static _defaultBinding:BleBinding = undefined;    
    static _instances: BleProtocol[] = []
    logger: EventLogger;
    ble: BleInterface;

    constructor(binding?: BleBinding) {
        super();
        const b = binding || BleProtocol._defaultBinding;
        this.logger = new EventLogger('BLE');
        this.ble = new BleInterface( {binding:b, logger:this.logger});
        BleProtocol._instances.push(this);
    }

    static setDefaultBinding(binding: BleBinding): void { 
        BleProtocol._defaultBinding = binding;
        BleProtocol._instances.forEach( (p) => { 
            if (p.ble && !p.ble.getBinding()) {
                p.ble.setBinding(binding);
            }
        })
    }

    setBinding(binding:BleBinding): void {
        if (this.ble)        
            this.ble.setBinding(binding);
    }

    createDevice (bleDevice: BleDeviceClass | BleDeviceSettings): Device {

        const fromDevice = bleDevice instanceof BleDeviceClass;
        const profile = bleDevice instanceof BleDeviceClass ? bleDevice.getProfile() : bleDevice.profile;

        const props = ()=> {
            const {id,name,address} = bleDevice;
            return {id,name,address} ;
        }

        switch ( profile.toLocaleLowerCase() ) {
            case 'hr':
            case 'heartrate monitor':
                return new HrmAdapter( fromDevice? bleDevice as BleDeviceClass : new BleHrmDevice(props()),this);
        }
        
    }

    getName(): string { return 'BLE'}
    getInterfaces(): Array<string> { return [INTERFACE.BLE]}
    isBike(): boolean { return true;}
    isHrm(): boolean { return true;}
    isPower(): boolean { return true;}
    
    
    add(settings: BleDeviceSettings):Device {
        this.logger.logEvent( {message:'adding device',settings})
        const device = this.createDevice(settings);
        return device;
    }

    async scan( props: ScanProps ): Promise<void> {
        try {
            
            
            this.ble.on('device', (bleDevice) => {
                if (props && props.onDeviceFound) {
                    const device = this.createDevice(bleDevice);
                    props.onDeviceFound(device,this);
                }
            })
            this.logger.logEvent({message:'scan started'})
            await this.ble.scan( {deviceTypes:supportedDeviceTypes} );
            if (props && props.onScanFinished) {
                props.onScanFinished(props.id);
            }

        }
        catch (err) {
            this.logger.logEvent( {message:'error', error: err.message} );
        }
       
    }

    async stopScan(): Promise<void>  {
        await this.ble.stopScan();
        return
    }  

    isScanning(): boolean {
        return this.ble.isScanning();
    }
   
}

DeviceRegistry.register( new BleProtocol() );