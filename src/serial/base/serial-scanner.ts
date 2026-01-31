import { EventLogger } from "gd-eventlog";
import SerialInterface from "./serial-interface.js";
import { SerialDeviceSettings, SerialInterfaceType, SerialScannerProps } from "../types.js";
import SerialAdapterFactory from "../factories/adapter-factory.js";
import { sleep } from "../../utils/utils.js";

export class SinglePathScanner {
    path: string;
    serial: SerialInterface;
    result!: SerialDeviceSettings;
    isScanning: boolean;
    props: SerialScannerProps;
    logger: EventLogger;
    isFound: boolean;
    protected stopPromise:Promise<boolean>|undefined

    constructor(path: string, serial: SerialInterface, props: SerialScannerProps) {
        this.path = path;
        this.serial = serial;
        this.isScanning = false;
        this.isFound = false;
        this.props = props;
        this.logger = props.logger || new EventLogger('SerialScanner');

    }

    logEvent(event:any) {
        if (this.logger) {
            this.logger.logEvent(event);
        }
    }


    async onStopRequest(resolve:(result:SerialDeviceSettings)=>void): Promise<void> {
        if (this.stopPromise!==undefined) {
            await this.stopPromise
            resolve(this.result);    
            return
        }

        this.logEvent({ message: 'stopping scan', path: this.path });

        this.serial.scanEvents.removeAllListeners('timeout')
        this.serial.scanEvents.removeAllListeners('stop')
        if (!this.isFound) {
            this.stopPromise = this.serial.closePort(this.path);
            await this.stopPromise
            this.stopPromise = undefined
        }
        this.isScanning = false;
        resolve(this.result);
    }

    async scan(): Promise<SerialDeviceSettings | undefined> {
        if (this.isScanning)
            return;

        this.isScanning = true;
        return new Promise<SerialDeviceSettings | undefined>(async (resolve, reject) => {
            this.logEvent({ message: 'starting scan', path: this.path, interface: this.serial.getName() });

            this.serial.scanEvents.on('timeout', () => this.onStopRequest(resolve));
            this.serial.scanEvents.on('stop', () => this.onStopRequest(resolve));

            
            let found = false;
            while (!found && this.isScanning) {
                try {

                    const { protocol } = this.props;

                    let host, port;
                    if (this.serial.getName() === SerialInterfaceType.TCPIP) {
                        [host, port] = this.path.split(':');
                    }
                    else {
                        port = this.path;
                    }

                    const adapterSettings = { interface: this.serial.getName(), host, port, protocol };

                    const adapter = SerialAdapterFactory.getInstance().createInstance(adapterSettings);

                    if (!adapter) {
                        this.isScanning = false;
                        resolve(this.result)
                        return
                    }
                    
                    if (this.isScanning) {

                        found = await adapter?.check();
                        if (found) {
                            this.isFound = true;
                            const name = adapter.getName();
                            resolve({ ...adapterSettings, name });
                        }
                        await adapter.close()
                        await sleep(1000);    
                    }
                    
                }
                catch (error) {
                    const err = error as Error
                    this.logEvent({ message: 'error', fn: 'scan()', error: err.message || err, stack: err.stack });
                    await sleep(2000);
                }

            }

        });

    }


}

