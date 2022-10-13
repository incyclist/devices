import DeviceAdapter from "../device";
import {EventLogger} from 'gd-eventlog'
import { DEFAULT_USER_WEIGHT, DEFAULT_BIKE_WEIGHT } from "../device";

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
    userSettings: { weight?:number};
    bikeSettings: { weight?:number};


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

    getWeight(): number { 
        let userWeight = DEFAULT_USER_WEIGHT;
        let bikeWeight = DEFAULT_BIKE_WEIGHT;

        if ( this.userSettings && this.userSettings.weight) {
            userWeight = Number(this.userSettings.weight);
        }
        if ( this.bikeSettings && this.bikeSettings.weight) {
            bikeWeight = Number(this.bikeSettings.weight);
        }        
        return bikeWeight+userWeight;

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
        if ( props && props.user)
            this.userSettings = props.user;
        if ( props && props.bikeSettings)
            this.bikeSettings = props.bikeSettings;

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