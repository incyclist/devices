import DeviceAdapter from "../Device";
import {EventLogger} from 'gd-eventlog'

export const DEFAULT_UPDATE_FREQUENCY  = 1000;

export default class AntAdapter extends DeviceAdapter {

    paused: boolean;
    stopped: boolean;

    ignoreHrm: boolean;
    ignoreBike: boolean;
    ignorePower: boolean;
    deviceID: string;
    port: string;
    stick: any;
    channel: number;
    sensor: any;

    deviceData: any;
    data: any;
    logger: EventLogger
    lastUpdate?: number;
    updateFrequency: number;


    constructor(protocol) {
        super(protocol)
        this.paused = false;
        this.stopped = false;
        this.ignoreHrm=false;
        this.ignoreBike=false;
        this.ignorePower=false;
        this.deviceID = undefined;
        this.port = undefined;
        this.stick = undefined;
        this.channel = -1;
        this.deviceData = {}
        this.data = {}
        this.updateFrequency = DEFAULT_UPDATE_FREQUENCY;
    }

    isSame(device:DeviceAdapter):boolean {
        if (!(device instanceof AntAdapter))
            return false;
        const adapter = device as AntAdapter;
        return  (adapter.getName()===this.getName() && adapter.getProfile()===this.getProfile())
    }

    setSensor(sensor) {
        this.sensor = sensor;
    }
    
    getID() {
        return this.deviceID;
    }

    setIgnoreHrm(ignore) {
        this.ignoreHrm = ignore
    }

    setIgnoreBike(ignore) {
        this.ignoreBike = ignore
    }
    setIgnorePower(ignore) {
        this.ignorePower = ignore
    }

    getProfile(): string {
        return "unknown"
    }

    getPort() 
    {
        return this.port;
    }

    setChannel(channel) {
        this.channel = channel;
    }

    setStick(stick) {
        this.stick = stick;
    }

    isStopped() {
        return this.stopped;
    }


    /* callback called whenever, we receive data on the Ant+ channel */
    onDeviceData(data) {}

    /* callback called whenever, we receive events on the Ant+ channel */
    onDeviceEvent(data) {}

    onAttached() {}

    /* The following methods are not required for Ant+ based Adpters*/
    update() {}
    check() {}
    connect() {}
    close() {}
    
    pause(): Promise<boolean> {
        return new Promise ( resolve => {
            this.paused = true;
            resolve(true)
        })
    }

    resume(): Promise<boolean> {
        return new Promise ( resolve => {
            this.paused = false;
            resolve(true)
        })

    }

    start( props?: any ): Promise<any> {
        return new Promise ( resolve => {
            this.stopped = false;
            resolve(true)
        })
    }

    stop(): Promise<boolean> {
        return new Promise ( resolve => {
            this.stopped = true;
            resolve(true)
        })
    }


}