import BleAdapter from "../base/adapter.js";
import { BleDeviceSettings, BleProtocol} from "../types.js";
import { DeviceProperties } from "../../types/index.js";
import { fullUUID, mapLegacyProfile } from "../utils.js";
import { BleDeviceData } from "../base/types.js";
import { TBleSensor } from "../base/sensor.js";
import { BleAdapterInfo, TBleAdapterFactory } from "./types.js";

export class BleAdapterFactory<T extends TBleSensor> implements TBleAdapterFactory<T> {
    static readonly _instances:Record<string, BleAdapterFactory<any>> = {};

    implementations: BleAdapterInfo<any>[]
    instances: Array<BleAdapter<BleDeviceData,T>>

    static getInstance(transport:string): BleAdapterFactory<any> {
        if (!BleAdapterFactory._instances[transport])
            BleAdapterFactory._instances[transport] = new BleAdapterFactory(transport) ;
        return BleAdapterFactory._instances[transport];
    }

    constructor(public transport:string) {
        this.implementations = []
        this.instances = []
    }

    getAdapterInfo(protocol:BleProtocol):BleAdapterInfo<T> {
        return  this.implementations.find(a=>a.protocol===protocol) 
    } 
    getAll():BleAdapterInfo<T>[] {
        return this.implementations
    }

    createInstance(settings:BleDeviceSettings,props?:DeviceProperties):BleAdapter<BleDeviceData,T> {
        let {profile, protocol} = settings;

        const adapterSettings = {...settings}

        if (profile) { // legacy settings 
            try {
                const mapping = mapLegacyProfile(profile)
                protocol = adapterSettings.protocol = mapping.protocol
                delete adapterSettings.profile
            }
            catch {

                // incorrect legacy settings
                delete settings.profile
               
            }
        }


        const existing = this.find(adapterSettings)
        if (existing) {
            existing.setProperties(props)
            return existing

        }

        const info = this.getAdapterInfo(protocol)

        if (!info?.Adapter)
            return

        const AdapterClass = info.Adapter  

        const adapter= new AdapterClass(adapterSettings,props)  
        this.instances.push(adapter )  
        return adapter
    }

    removeInstance( query:{settings?:BleDeviceSettings, adapter?:BleAdapter<BleDeviceData,T>}):void {
        let idx=-1;

        if (query.settings) {   
            idx =  this.instances.findIndex( a=>a.isEqual(query.settings))
        }
        else if (query.adapter) {
            idx =  this.instances.findIndex( a=>a.isEqual(query.adapter.getSettings()))
        }
        if (idx!==-1) 
            this.instances.splice(idx)
    }

    find(settings?:BleDeviceSettings) {
        return this.instances.find( a=>a.isEqual(settings))
    }


    register( protocol: BleProtocol, Adapter: typeof BleAdapter<BleDeviceData,T>,Sensor: typeof TBleSensor)  {       
        const info = {protocol, Adapter,Sensor}
        const existing = this.implementations.findIndex( a => a.protocol===protocol) 

        if (existing!==-1)
            this.implementations[existing]= info;
        else    
            this.implementations.push(info)
    }

    getAllInstances(): Array<BleAdapter<BleDeviceData,T>> {
        return this.instances
    }


    getAllSupportedSensors(): (typeof TBleSensor)[] {
        const supported = this.getAll()
        return supported.map( info => info.Sensor)
    }
    getAllSupportedAdapters(): Array<(typeof BleAdapter<BleDeviceData,T>)> {
        const supported = this.getAll()
        return supported.map( info => info.Adapter)
    }

    getServices(info:BleAdapterInfo<T>):string[] {
        const Sensor = info.Sensor
        if (!Sensor)
            return []
        const sensor = new Sensor(null,{})
        return sensor.getServiceUUids().map(fullUUID)
    }
    
    getAllSupportedServices():string[] {
        const supported = this.getAll()
        const res = []
        
        if (supported && supported.length>0) {
            supported.forEach( info => {
                const services = this.getServices(info)
                services.forEach( s => {
                    if ( !res.includes(s))
                        res.push(s)
                })
            })
        }
        
    
        return res;
    }

    getProtocol(services:string[]):BleProtocol {
        const matching = this.getMatchingSensors(services)
        if (!matching?.length) {
            return;
        }

        if (matching.length===1) {
            return matching[0].getProtocol()
        }
        matching.sort( (a,b) => b.getDetectionPriority()-a.getDetectionPriority())
        return matching[0].getProtocol()
    }

    protected getMatchingSensors (services:string[], props:{ protocol?: BleProtocol, services?: string[] } = {}): TBleSensor[] {
        let sensors;
        const {protocol}  = props;
    
    
        // find matching Classes in the set of all registered Device Classes
        const classes = this.getAllSupportedSensors()
        sensors = this.getSensorsFromServices( classes, services) 

        if (protocol && sensors?.length>0) {
            return sensors.filter( sensor  => {                
                
                if (sensor.getProtocol()!==protocol) 
                    return false;
                return true;
            })
           
        }
        return sensors
    }

    getSensorsFromServices(sensorTypes : (typeof TBleSensor)[],services :string | string[]) :TBleSensor[] {
        if (!sensorTypes || !Array.isArray(sensorTypes) || sensorTypes.length === 0) {
            return []
        }

        let serviceUUIDs = Array.isArray(services) ? services : [services]; 
   
        const types =  sensorTypes.map(SensorType=>new SensorType(null)).filter( sensor  => sensor.isMatching(serviceUUIDs))    
        return types;
    
    }
    
    
    

}