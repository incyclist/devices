import {Device} from '../protocol'

import { IChannel, ISensor } from 'incyclist-ant-plus'
import AntProtocol, { AntDeviceSettings, mapAntProfile } from './incyclist-protocol';
import AntInterface from './ant-interface';
import IncyclistDevice, { DeviceAdapter, OnDeviceDataCallback } from '../device';
export const DEFAULT_UPDATE_FREQUENCY  = 1000;

const NO_DATA_TIMEOUT = 5000;

export default class AntAdapter  extends IncyclistDevice implements Device   {

    sensor: ISensor;
    protocol: AntProtocol
    ignoreHrm: boolean;
    ignoreBike: boolean;
    ignorePower: boolean;
    lastUpdate?: number;
    data: any;
    deviceData: any;
    updateFrequency: number;
    channel: IChannel;
    ant: AntInterface
    stopped: boolean;
    paused: boolean
    userSettings: { weight?:number};
    bikeSettings: { weight?:number};
    detected: boolean
    selected: boolean
    settings: any
    onDataFn: OnDeviceDataCallback
    protected ivDataTimeout: NodeJS.Timer
    protected lastDataTS: number;



    constructor ( sensor: ISensor, protocol: AntProtocol, settings?) {
        super(protocol, settings)
        
        this.sensor = sensor;
        this.protocol = protocol   
        this.ignoreHrm=false;
        this.ignoreBike=false;
        this.ignorePower=false;
        this.deviceData = {}
        this.data = {}
        this.updateFrequency = DEFAULT_UPDATE_FREQUENCY;
        this.channel = undefined;
        this.paused = false;
        this.stopped = false;
        this.ant = AntInterface.getInstance()
        

    }

    isBike(): boolean {
        throw new Error('Method not implemented.');
    }
    isPower(): boolean {
        throw new Error('Method not implemented.');
    }
    isHrm(): boolean {
        throw new Error('Method not implemented.');
    }
    getDisplayName(): string {
        throw new Error('Method not implemented.');
    }


    isSame(device:DeviceAdapter):boolean {
        if (!(device instanceof AntAdapter))
            return false;
        const adapter = device as AntAdapter;
        return  (adapter.getID()===this.getID() && adapter.getProfile()===this.getProfile())
    }



    getID(): string {
        return this.sensor.getDeviceID().toString();
    }

    getName(): string {
        const deviceID = this.sensor.getDeviceID();
        const profile  = this.sensor.getProfile();

        return `Ant+${profile} ${deviceID}`;
    }

    

    getProfile():string {
        return mapAntProfile(this.sensor.getProfile());
    }

    getPort(): string {
        return undefined;
    }
    getProtocol(): AntProtocol {
        return this.protocol
    }


    getProtocolName(): string    {
        return this.protocol.getName()
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

    startDataTimeoutCheck() {
        if (this.ivDataTimeout)
            return;

        this.ivDataTimeout = setInterval( ()=>{
            if (!this.lastDataTS)
                return;

            if (this.lastDataTS+NO_DATA_TIMEOUT<Date.now()) {
                this.emit('disconnected', Date.now()-this.lastDataTS)
            }
        }, 1000)
    }

    stopDataTimeoutCheck() {
        if (!this.ivDataTimeout)
            return;
        clearInterval(this.ivDataTimeout)
        this.ivDataTimeout = undefined
    }


    async start( props?: any ): Promise<any> {
        if ( props && props.user)
            this.userSettings = props.user;
        if ( props && props.bikeSettings)
            this.bikeSettings = props.bikeSettings;
        
        this.stopped = false;
        return true;        
    }

    async stop(): Promise<boolean> {
        this.stopDataTimeoutCheck()
        this.stopped = true;
 
        return true;
    }



    isStopped() {
        return this.stopped;
    }
}