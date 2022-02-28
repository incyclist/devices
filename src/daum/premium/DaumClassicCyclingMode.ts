import { EventLogger } from "gd-eventlog";
import CyclingMode, { CyclingModeProperty, CyclingModeProperyType, IncyclistBikeData, Settings, UpdateRequest } from "../../CyclingMode";
import DaumAdapter from "../DaumAdapter";
import PowerMeterCyclingMode from "../PowerMeterCyclingMode";


const config = {
    name: "Daum Classic",
    description: "The device calculates speed and power based on slope. Incyclist will not modify any values recived from the device\nThis mode will not respect maximum power and/or workout limits",
    properties: [
        {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain'], default: 'Race'},
    ]
}


export default class DaumClassicCyclingMode extends PowerMeterCyclingMode implements CyclingMode {
    constructor(adapter: DaumAdapter, props?: Settings) {
        super(adapter,props);
        this.logger = adapter ? adapter.logger : undefined;
        if (!this.logger) this.logger = new EventLogger('DaumClassic')      

        this.setModeProperty('eppSupport',true)
        this.setModeProperty('setPersonSupport',true)
    }

    getName(): string {
        return config.name;
    }
    getDescription(): string {
        return config.description;
    }
    getProperties(): CyclingModeProperty[] {
        return config.properties;
    }
    getProperty(name: string): CyclingModeProperty {
        return config.properties.find(p => p.name===name);
    }

    getBikeInitRequest(): UpdateRequest {
        return {}
    }    

    getSettings(): Settings {
        const settings = super.getSettings();
        settings['setPerson'] = true;
        return settings;
    }

    getSetting(name: string) {
        if (name==='setPerson') return true;
        return super.getSetting(name);
    }

    updateData(data: IncyclistBikeData) {
        try {
            const prevData = this.data || {} as any;
            const prevRequest = this.prevRequest || {} as any;
            const bikeData = JSON.parse(JSON.stringify(data));

            let power = data.power || 0;
            let speed = data.speed || 0

            let slope = ( prevData.slope!==undefined ? prevData.slope : prevRequest.slope || 0); // ignore slope delivered by bike
            let distanceInternal = prevData.distanceInternal || 0;  // meters

            
            if (!bikeData.pedalRpm || bikeData.isPedalling===false) {
                speed = 0;
                power = 0;
            }

            // calculate speed and distance
            let ts = Date.now();
            let v = speed/3.6;
            let duration =  this.prevUpdateTS===0 ? 0: ((ts-this.prevUpdateTS)/1000) ; // sec
            distanceInternal += Math.round(v*duration);
            

            data.speed = parseFloat(speed.toFixed(1));
            data.power = Math.round(power);
            data.distanceInternal = Math.round(distanceInternal);
            data.distance = Math.round(distanceInternal/100);  
            data.slope = slope;

            this.logger.logEvent( {message:"updateData result",data,bikeData,prevRequest:{},prevSpeed:prevData.speed} );

            this.data = JSON.parse(JSON.stringify(data));
            this.prevUpdateTS = ts       
    
        }
        catch (err) /* istanbul ignore next */ {
            this.logger.logEvent({message:'error',fn:'updateData()',error:err.message||err})
        }

        return data;

    }


}