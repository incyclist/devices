import DeviceProtocolBase, { DeviceProtocol, DeviceSettings, ScanProps,  INTERFACE } from '../../DeviceProtocol'
import { EventLogger } from 'gd-eventlog';
import DeviceRegistry from '../../DeviceRegistry';
import KettlerRacerAdapter from './adapter';

const PROTOCOL_NAME = 'Kettler Racer'

export interface KettlerRacerScanProps extends ScanProps  {
    port: string;
}

enum ScanState { 
    IDLE,
    SCANNING,
    STOPPING,
    STOPPED
}

export interface ScanDescription {
    device: KettlerRacerAdapter;
    port: string;
    iv: NodeJS.Timeout;
    state: ScanState;
    props: KettlerRacerScanProps;
}



export default class KettlerRacerProtocol extends DeviceProtocolBase implements DeviceProtocol {

    private state: ScanState;
    private logger: EventLogger;
    private activeScans: Array<ScanDescription>

    constructor() {
        super();
        this.state = ScanState.IDLE
        this.logger = new EventLogger('KettlerRacer');
        this.activeScans = []
        this.devices = [];        
    }

    getSerialPort(): any {
        return DeviceProtocolBase.getSerialPort();
    }

    getInterfaces(): string[] {
        return [INTERFACE.SERIAL];
    }
    getName(): string {
       return PROTOCOL_NAME;
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

    add(settings: DeviceSettings) {
        this.logger.logEvent( {message:'adding device',settings})

        if (this.devices.length>0) {
            const found =this.devices.find( d  => d.getPort()===settings.port);
            if (found)
                return found;
        }

        let device = new KettlerRacerAdapter(this,settings)
        this.devices.push(device)
        return device
    }

    scan(props: KettlerRacerScanProps): void {
        this.logger.logEvent( {message:'start scan',id:props.id, port:props.port})
        this.state = ScanState.SCANNING

        const isAlreadyKnownOrScanning = this.checkDevice(props.port)

        if (!isAlreadyKnownOrScanning) {
            const port = props.port;
            const name = PROTOCOL_NAME;
            const device = new KettlerRacerAdapter(this,{name, port})
            const iv = setInterval( ()=> {this.doScan(port)}, 1000)
            this.activeScans.push( { iv,device,port,state:ScanState.IDLE,props})
        }
    }

    checkDevice(port: string): boolean { 
        if (this.devices.length>0 &&  this.devices.findIndex( d  => d.getPort()===port)>=0)
            return true;

        if (this.activeScans.length>0 &&  this.activeScans.findIndex( d  => d.port===port)>=0)
            return true;

        return false;
    }

    doScan( port: string): Promise<void> {

        const job = this.activeScans.find( d  => d.port===port)
        if (!job)
            return;
        if ( this.state===ScanState.STOPPING || job.state===ScanState.STOPPING) 
            return;

        const device = job.device;    
        if (device && (device.isDetected() || device.isSelected()) ) 
            return;

        this.state = ScanState.SCANNING
        job.state = ScanState.SCANNING
     
        return device.check()
        .then( async (found: boolean)=>{

            if (found) {
                // device was detected after stop scan request
                if ( this.state===ScanState.STOPPING || this.state===ScanState.STOPPED)
                    return;

                const {onDeviceFound,onScanFinished,id} = job.props;
                device.setDetected();
                if ( onDeviceFound)
                    onDeviceFound( device, device.getProtocol())
                if ( onScanFinished) {
                    onScanFinished(id)
                }

            }
            job.state = ScanState.STOPPED;

            try {
                await device.waitForClosed()
            }
            catch ( err) {
                this.logger.logEvent( {message:'scanCommand warning: Could not close port',error:err.message})
            }
            
            clearInterval(job.iv);
            job.iv=null;
            job.state=ScanState.STOPPED;

            const idxActiveScan = this.activeScans.findIndex( d  => d.state!==ScanState.STOPPED)
            if (idxActiveScan===-1) {
                this.state = ScanState.STOPPED
            }

            
        })
        .catch( ()=> { 
            job.state=ScanState.STOPPED;
        })
        
    }

    async doStopScan( job: ScanDescription): Promise<void> {
        
        if (!job)
            return;
        if ( job.state===ScanState.STOPPING || job.state===ScanState.STOPPED)
            return;

        job.state = ScanState.STOPPING;
        clearInterval(job.iv);
        job.iv=null;

    }

    isJobStopped(job: ScanDescription): boolean {
        return job.state===ScanState.STOPPED && !job.iv; 
    }

    waitForStop(timeout?: number): Promise<boolean> {

        return new Promise( (resolve)=> {

            let timedOut = false;
            if (timeout) setTimeout( ()=> {timedOut=true}, timeout)
            
            const iv = setInterval( ()=> {
                const idxActiveScan = this.activeScans.findIndex( d  => this.isJobStopped(d)===false)
                if (idxActiveScan===-1) {                
                    clearInterval(iv)                    
                    resolve(true);
                    return;
                }
                if (timedOut) {
                    clearInterval(iv)
                    resolve(false);
                    return;
                }

            }, 500)
    
        })

    }

    async stopScan() {
        if ( this.state === ScanState.STOPPING || this.state === ScanState.STOPPED)
            return;
        this.state = ScanState.STOPPING;

        this.logger.logEvent( {message:'stop scan',activeScans:this.activeScans.map(j => j.port)})

        
        this.activeScans.forEach( job => this.doStopScan(job) )                  
        const stopped = await this.waitForStop()
        if (!stopped) {
            this.logger.logEvent( {message:'scanCommand warning: stop scan timeout'});
        }
        else  {
            this.logger.logEvent( {message:'stop scan completed'})
        }

        this.activeScans =[];
        this.state = ScanState.IDLE;
        return true;
    }   

    isScanning(): boolean {
        return this.state === ScanState.SCANNING;
    }

}

DeviceRegistry.register(new KettlerRacerProtocol());
