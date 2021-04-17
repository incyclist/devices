import DeviceProtocol, { INTERFACE } from '../../DeviceProtocol';
import DeviceRegistry from '../../DeviceRegistry'
import {Daum8iSerial,Daum8iTcp} from '../premium/bike'
import DaumPremium from './DaumPremiumAdapter'
import { EventLogger } from 'gd-eventlog';

const PROTOCOL_NAME = "Daum Premium"

export interface DaumPremiumProtocolState  {
    activeScans: Array<any>;
    scanning: boolean;
    stopScanning?: boolean;
}

const DefaultState: DaumPremiumProtocolState = {
    activeScans: [],
    scanning: false,
    stopScanning: false
}
export default class DaumPremiumProtocol extends DeviceProtocol {

    state: DaumPremiumProtocolState;
    logger: EventLogger;

    constructor() {
        super();
        this.state = DefaultState;
        this.logger = new EventLogger('DaumPremium');

        this.devices = [];
    }

    getName() {
        return PROTOCOL_NAME;
    }
    getInterfaces() {
        return [ INTERFACE.SERIAL, INTERFACE.TCPIP]
    }

    isBike() {
        return true;
    }
    isHrm() {
        return true;
    }
    isPower() {
        return true;
    }

    scan( props ) {
        const opts = props || {}
        this.logger.logEvent( {message:'start scan',opts})

        if(opts.interface===INTERFACE.TCPIP) {
            this.scanTcpip(opts);
        }
        else if ( opts.interface===INTERFACE.SERIAL) {
            this.scanSerial(opts);
        }
        
    }

    addDevice( DeviceClass, opts, portName ) {
        let device;

        if ( this.devices.length===0) {
            const bike = new DeviceClass(opts);
            device = new DaumPremium(this,bike)
            this.devices.push( device )            
        } 
        else {
            const idx = this.devices.findIndex( d => d.getBike().getPort()===portName)
            if ( idx===-1) {
                const bike = new DeviceClass(opts);
                device = new DaumPremium(this,bike)
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

    scanTcpip(opts) {
        Daum8iTcp.setNetImpl( DeviceProtocol.getNetImpl())

        const {host,port} = opts;
        let device = this.addDevice( Daum8iTcp, opts, `${host}:${port||51955}`)
        if (device) {
            const iv = setInterval( ()=> {this.scanCommand(device,opts)}, 500)
            this.state.activeScans.push( { iv,device})
        }
    }

    scanSerial(opts) {

        Daum8iSerial.setSerialPort( DeviceProtocol.getSerialPort())
        let device = this.addDevice( Daum8iSerial, opts, opts.port)
        if (device) {
            const iv = setInterval( ()=> {this.scanCommand(device,opts)}, 500)
            this.state.activeScans.push( { iv,device})
        }
        

    }

    async stopScan() {
        this.logger.logEvent( {message:'stop scan',activeScans:this.state.activeScans})

        this.state.stopScanning = true;

        if ( this.state.activeScans.length>0) {
            this.state.activeScans.forEach( scan => {
                clearInterval(scan.iv)
                scan.iv = undefined;
                scan.scanning = false;
            })
            this.state.activeScans =[];
            
        }

        for ( let i=0; i<this.devices.length;i++) {        
            const d = this.devices[i];
            if ( !d.isSelected() && !d.isDetected()) {
                try {
                    await d.getBike().saveClose(true);
                }
                catch (err) {
                    this.logger.logEvent( {message:'stop scan error',error:err.message})
                }
            }
        }

        for ( let i=0; i<this.devices.length;i++) {        
            const d = this.devices[i];
            if ( !d.isSelected() && !d.isDetected()) {
                try {
                    await d.getBike().unblock();
                }
                catch (err) {
                }
            }
        }
        

        this.state.scanning = false;
        this.state.stopScanning = false;
        this.logger.logEvent( {message:'stop scan completed'})
        return true;
    }   


    scanCommand(device,opts) {
        const scan = this.state.activeScans.find( actScan => actScan.device.getBike().getPort()===device.getBike().getPort())

        if ( this.state.stopScanning || (scan && scan.scanning) || device.isDetected())
            return;

        scan.scanning = true;
        device.check( )
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

const premium = new DaumPremiumProtocol();
DeviceRegistry.register(premium);
