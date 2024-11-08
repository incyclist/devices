import { EventLogger } from "gd-eventlog";
import SerialInterface from "./serial-interface";
import { SerialDeviceSettings, SerialInterfaceType, SerialScannerProps } from "../types";
import SerialAdapterFactory from "../factories/adapter-factory";
import { sleep } from "../../utils/utils";

export class SinglePathScanner {
    path: string;
    serial: SerialInterface;
    result: SerialDeviceSettings;
    isScanning: boolean;
    props: SerialScannerProps;
    logger: EventLogger;
    isFound: boolean;

    constructor(path: string, serial: SerialInterface, props: SerialScannerProps) {
        this.path = path;
        this.serial = serial;
        this.result = undefined;
        this.isScanning = false;
        this.isFound = false;
        this.props = props;
        this.logger = props.logger || new EventLogger('SerialScanner');

    }

    logEvent(event) {
        if (this.logger) {
            this.logger.logEvent(event);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = global.window as any;

        if (w?.DEVICE_DEBUG || process.env.BLE_DEBUG|| process.env.ANT_DEBUG|| process.env.SERIAL_DEBUG) {
            console.log('~~~ SerialScanner', event);
        }

    }


    async onStopRequest(resolve): Promise<void> {
        this.logEvent({ message: 'stopping scan', path: this.path });
        if (!this.isFound)
            await this.serial.closePort(this.path);
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
                catch (err) {
                    /* ignore*/
                    this.logEvent({ message: 'error', fn: 'scan()', error: err.message || err, stack: err.stack });
                    await sleep(2000);
                }

            }

        });

    }


}

