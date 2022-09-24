import { BleDevice } from './ble-device';
import BleInterface from './ble-interface';
import BleProtocol from './incyclist-protocol';
import { BleDeviceClass } from './ble';
import DeviceAdapter,{ DeviceData,DEFAULT_USER_WEIGHT, DEFAULT_BIKE_WEIGHT } from '../Device';
import { DeviceProtocol } from '../DeviceProtocol';
import {EventLogger} from 'gd-eventlog';
import CyclingMode from '../CyclingMode';

import PowerMeterCyclingMode from '../modes/power-meter';
import { IncyclistBikeData } from '../CyclingMode';

const CP_MEASUREMENT = '2a63';
const CP_FEATURE = '2a65'

type PowerData = {
    instantaneousPower?: number;
    balance?: number;
    accTorque?: number;
    time: number;
    rpm: number;
    raw?: string;
}

type CrankData = {
    revolutions?: number,
    time?: number,
    cntUpdateMissing?: number,
}

export default class BleCyclingPowerDevice extends BleDevice {
    static services =  ['1818'];
    static characteristics =  [ CP_MEASUREMENT, CP_FEATURE, '2a5d', '2a3c' ];
    
    instantaneousPower: number = undefined;
    balance: number = undefined;
    accTorque:number = undefined;
    rpm: number = undefined
    timeOffset: number = 0
    time: number = undefined
    currentCrankData: CrankData = undefined
    prevCrankData: CrankData = undefined
    
    constructor (props?) {
        super(props)
    }

    isMatching(characteristics: string[]): boolean {
        if (!characteristics)
            return false;

        const hasCPMeasurement =  characteristics.find( c => c===CP_MEASUREMENT)!==undefined
        const hasCPFeature = characteristics.find( c => c===CP_FEATURE)!==undefined
        
        return hasCPMeasurement && hasCPFeature
    }


    async init(): Promise<boolean> {
        try {
            await super.init();
        }
        catch (err) {
            return Promise.resolve(false)
        }
    }

    getProfile(): string {
        return 'Power Meter';
    }

    getServiceUUids(): string[] {
        return BleCyclingPowerDevice.services;
    }

    parseCrankData(crankData) {
        if (!this.prevCrankData) this.prevCrankData= {revolutions:0,time:0, cntUpdateMissing:-1}

        const c = this.currentCrankData = crankData
        const p = this.prevCrankData;
        let rpm = this.rpm;
        
        let hasUpdate = c.time!==p.time;

        if ( hasUpdate) { 
            let time = c.time - p.time //+ c.time<p.time ? 0x10000: 0
            let revs = c.revolutions - p.revolutions //+ c.revolutions<p.revolutions ? 0x10000: 0

            if (c.time<p.time) {
                 time+=0x10000;
                 this.timeOffset+=0x10000;
                 
            }

            if (c.revolutions<p.revolutions) revs+=0x10000;
            
            rpm = 1024*60*revs/time
        }
        else {
            if ( p.cntUpdateMissing<0 || p.cntUpdateMissing>2) {
                rpm = 0;
            }
        }
        const cntUpdateMissing = p.cntUpdateMissing;
        this.prevCrankData = this.currentCrankData
        if ( hasUpdate)  
            this.prevCrankData.cntUpdateMissing = 0;
        else 
            this.prevCrankData.cntUpdateMissing = cntUpdateMissing+1;

        return {rpm, time:this.timeOffset+c.time }
    }

    parsePower(_data: Uint8Array):PowerData { 
        const data:Buffer = Buffer.from(_data);
        try {
            let offset = 4;
            const flags = data.readUInt16LE(0)

            this.instantaneousPower = data.readUInt16LE(2)
            
            if ( flags&0x1)  
                this.balance = data.readUInt8(offset++);
            if ( flags&0x4)  {
                this.accTorque = data.readUInt16LE(offset);
                offset+=2;
            }

            if ( flags&0x10)  {  // wheel revolutions

            }
            if ( flags&0x20)  {  // crank revolutions
                const crankData = { 
                    revolutions: data.readUInt16LE(offset),
                    time: data.readUInt16LE(offset+2)
                }
                const {rpm,time} = this.parseCrankData(crankData)                
                this.rpm = rpm;
                this.time = time;
                offset+=4
            }
            
        }
        catch (err) { 

        }
        const {instantaneousPower, balance,accTorque,rpm,time} = this
        return {instantaneousPower, balance,accTorque,rpm,time,raw:`2a63:${data.toString('hex')}`}
    }

    onData(characteristic:string,data: Buffer) {
        super.onData(characteristic,data);

        const isDuplicate = this.checkForDuplicate(characteristic,data)
        if (isDuplicate)
            return;


        if (characteristic.toLocaleLowerCase() === CP_MEASUREMENT) { //  name: 'Cycling Power Measurement',
            const res = this.parsePower(data)
            this.emit('data', res)
        }
  
    }

    reset() {
        this.instantaneousPower = undefined;
        this.balance = undefined;
        this.accTorque = undefined;
        this.rpm = undefined
        this.timeOffset = 0
        this.time = undefined
        this.currentCrankData = undefined
        this.prevCrankData = undefined
    
    }

}
BleInterface.register('BleCyclingPowerDevice','cp', BleCyclingPowerDevice,BleCyclingPowerDevice.services)

export class PwrAdapter extends DeviceAdapter {

    
    device: BleCyclingPowerDevice;
    ignore: boolean = false;
    ble:BleInterface
    protocol: DeviceProtocol;
    paused: boolean = false;
    logger: EventLogger;
    mode: CyclingMode
    distanceInternal: number = 0;
    prevDataTS: number;
    userSettings: { weight?:number};
    bikeSettings: { weight?:number};



    constructor( device: BleDeviceClass, protocol: BleProtocol) {
        super(protocol);
        this.device = device as BleCyclingPowerDevice;
        this.ble = protocol.ble
        this.mode = this.getDefaultCyclingMode()
        this.logger = new EventLogger('Ble-CP')
        
    }

    isBike() { return true;}
    isHrm() { return false;}
    isPower() { return true; }
    isSame(device:DeviceAdapter):boolean {
        if (!(device instanceof PwrAdapter))
            return false;
        const adapter = device as PwrAdapter;
        return  (adapter.getName()===this.getName() && adapter.getProfile()===this.getProfile())
    }
   
    getProfile() {
        return 'Power Meter';
    }

    getName() {
        return `${this.device.name}`        
    }

    getDisplayName() {
        const {name,instantaneousPower: power} = this.device;
        const powerStr = power ? ` (${power})` : '';
        return `${name}${powerStr}`
    }
    
    getCyclingMode(): CyclingMode {
        if (!this.mode)
            this.mode =  this.getDefaultCyclingMode();
        return this.mode

    }
    getDefaultCyclingMode(): CyclingMode {
        return new PowerMeterCyclingMode(this);
    }


    getPort():string {
        return 'ble' 
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

    setIgnoreBike(ignore: any): void {
        this.ignore = ignore;
    }

    setIgnorePower(ignore: any): void {
        this.ignore = ignore;
    }

    onDeviceData(deviceData:PowerData):void {

        if (this.prevDataTS && Date.now()-this.prevDataTS<1000)
            return;
        this.prevDataTS = Date.now()
        

        this.logger.logEvent( {message:'onDeviceData',data:deviceData})        

        // transform data into internal structure of Cycling Modes
        let incyclistData = this.mapData(deviceData)              
        
        // let cycling mode process the data
        incyclistData = this.getCyclingMode().updateData(incyclistData);                    

        // transform data into structure expected by the application
        const data =  this.transformData(incyclistData);                  

        if (this.onDataFn && !this.ignore && !this.paused)
            this.onDataFn(data)

    }

    mapData(deviceData:PowerData): IncyclistBikeData{
        // update data based on information received from ANT+PWR sensor
        const data = {
            isPedalling: false,
            power: 0,
            pedalRpm: undefined,
            speed: 0,
            heartrate:0,
            distanceInternal:0,        // Total Distance in meters             
            slope:undefined,
            time:undefined
        }

        data.power = (deviceData.instantaneousPower!==undefined? deviceData.instantaneousPower :data.power);
        data.pedalRpm = (deviceData.rpm!==undefined? deviceData.rpm :data.pedalRpm) ;
        data.time = (deviceData.time!==undefined? deviceData.time :data.time);
        data.isPedalling = data.pedalRpm>0 || (data.pedalRpm===undefined && data.power>0);
        return data;
    }

    transformData( bikeData:IncyclistBikeData): DeviceData {
        if (this.ignore) {
            return {};
        }
        
        if ( bikeData===undefined)
            return;
    
        let distance=0;
        if ( this.distanceInternal!==undefined && bikeData.distanceInternal!==undefined ) {
            distance = Math.round(bikeData.distanceInternal-this.distanceInternal)
        }

        if (bikeData.distanceInternal!==undefined)
            this.distanceInternal = bikeData.distanceInternal;
        
        let data =  {
            speed: bikeData.speed,
            slope: bikeData.slope,
            power: bikeData.power!==undefined ? Math.round(bikeData.power) : undefined,
            cadence: bikeData.pedalRpm!==undefined ? Math.round(bikeData.pedalRpm) : undefined,
            distance,
            timestamp: Date.now()
        } as DeviceData;

        return data;
    }


    async start( props?: any ): Promise<any> {
        if ( props && props.user)
            this.userSettings = props.user;
        if ( props && props.bikeSettings)
            this.bikeSettings = props.bikeSettings;

        this.logger.logEvent({message: 'start requested', profile:this.getProfile(),props})
        try {
            const bleDevice = await this.ble.connectDevice(this.device) as BleCyclingPowerDevice
            if (bleDevice) {
                this.device = bleDevice;
                bleDevice.on('data', (data)=> {
                    this.onDeviceData(data)
                    
                })
                return true;
            }    
        }
        catch(err) {
            this.logger.logEvent({message: 'start result: error', error: err.message, profile:this.getProfile()})
            throw new Error(`could not start device, reason:${err.message}`)

        }
    }

    async stop(): Promise<boolean> { 
        this.logger.logEvent({message: 'stop requested', profile:this.getProfile()})
        this.distanceInternal = 0;
        this.device.reset();
        return  this.device.disconnect();        
    }

    async sendUpdate(request) {
        // don't send any commands if we are pausing
        if( this.paused)
            return;

        this.getCyclingMode().sendBikeUpdate(request)
        //this.logger.logEvent({message:'sendUpdate',request});    
        
    } 

    pause(): Promise<boolean> { this.paused = true; return Promise.resolve(true)}
    resume(): Promise<boolean> { this.paused = false; return Promise.resolve(true)}
}

