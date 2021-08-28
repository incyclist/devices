import DeviceProtocolBase, { INTERFACE,ScanProps, DeviceProtocol } from '../../DeviceProtocol';
import DeviceRegistry from '../../DeviceRegistry'
import Bike from './bike'
import Adapter from './DaumClassicAdapter'
import { EventLogger } from 'gd-eventlog';
import DaumClassicAdapter from './DaumClassicAdapter';

const PROTOCOL_NAME = "Daum Classic"

export interface DaumClassicProtocolState  {
    activeScans: Array<any>;
    scanning: boolean;
    stopScanning?: boolean;
}

const DefaultState: DaumClassicProtocolState = {
    activeScans: [],
    scanning: false,
    stopScanning: false
}

export interface DaumClassicScanProps extends ScanProps  {
    port: string;
}


export default class DaumClassicProtocol extends DeviceProtocolBase implements DeviceProtocol {
    logger: EventLogger;
    state: DaumClassicProtocolState;

    constructor() {
        super();
        this.state = DefaultState
        this.logger = new EventLogger('DaumClassic');
        this.devices = [];
    }

    getName(): string {
        return PROTOCOL_NAME;
    }
    getInterfaces(): Array<string> {
        return [ INTERFACE.SERIAL]
    }

    isBike(): boolean {
        return true;
    }
    isHrm(): boolean {
        return true;
    }
    isPower(): boolean {
        return true;
    }

    scan( props: DaumClassicScanProps):void {
        this.logger.logEvent( {message:'start scan',id:props.id, port:props.port})
        Bike.setSerialPort( DeviceProtocolBase.getSerialPort())
        this.state.scanning=true;

        let device = this.addDevice( props, props.port)
        if (device) {
            const iv = setInterval( ()=> {this.scanCommand(device,props)}, 1000)
            this.state.activeScans.push( { iv,device,props})
        }
    }

    addDevice( opts, portName ) {
        let device;

        if ( this.devices.length===0) {
            const bike = new Bike(opts);
            device = new Adapter(this,bike)
            this.devices.push( device )            
        } 
        else {
            const devices = this.devices as Array<DaumClassicAdapter>

            const idx = devices.findIndex( d  => d.getBike().getPort()===portName)
            if ( idx===-1) {
                const bike = new Bike(opts);
                device = new Adapter(this,bike)
                this.devices.push( device )                            
            }
            else {
                device = this.devices[idx];
                if ( device.isSelected() || device.isDetected() )
                    device = undefined;
            }
        }
        return device;
    }

    async stopScan() {
        if ( this.state.stopScanning)
            return;
        this.state.stopScanning = true;

        this.logger.logEvent( {message:'stop scan',activeScans:this.state.activeScans})
        const stopRequired = [];

        if ( this.state.activeScans.length>0) {
            this.state.activeScans.forEach( scan => {
                stopRequired.push(scan.scanning);
                clearInterval(scan.iv)
                scan.iv = undefined;
                scan.scanning = false;
            })
            
        }

        for ( let i=0; i<this.state.activeScans.length;i++) {        
            const as = this.state.activeScans[i];
            const toStop = stopRequired[i];
            const d = as.device;
            if ( !d.isSelected() && !d.isDetected()) {
                try {                    
                    await d.close();
                }
                catch (err) {
                    this.logger.logEvent( {message:'stop scan error',error:err.message})
                }
            }
            if (toStop) {
                const {id,onScanFinished} = as.props;
                if ( onScanFinished)
                    onScanFinished(id)
    
            }

        }
        this.state.activeScans =[];

        this.state.scanning = false;
        this.state.stopScanning = false;
        this.logger.logEvent( {message:'stop scan completed'})
        return true;
    }   

    isScanning() {
        return this.state.scanning;
    }

    scanCommand(device,opts) {
        const scan = this.state.activeScans.find( actScan => actScan.device.getBike().getPort()===device.getBike().getPort())
        
        if ( this.state.stopScanning || (scan && scan.scanning) || device.isDetected())
            return;
        scan.scanning = true;
        return device.check()
        .then( ()=>{
            // device was detected after stop scan request
            if ( this.state.stopScanning)
                return;

            const {onDeviceFound,onScanFinished,id} = opts;
            device.setDetected();
            if ( onDeviceFound)
                onDeviceFound( device, device.getProtocol())
            if ( onScanFinished) {
                onScanFinished(id)
            }
            // device found - no need to continue
            clearInterval(scan.iv);
            scan.iv=undefined;
            scan.scanning = false;

            
        })
        .catch( ()=> { 
            scan.scanning = false;
        })

    }

}

DeviceRegistry.register(new DaumClassicProtocol());
