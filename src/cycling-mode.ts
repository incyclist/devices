import {Device} from "./protocol"

export type UpdateRequest = {
    slope?: number;
    minPower?: number;
    maxPower?: number;
    targetPower?: number;
    targetPowerDelta?: number;
    reset?: boolean;
    refresh?: boolean;
}
export enum CyclingModeProperyType {
    Integer = 'Integer',
    Boolean = 'Boolean',
    Float = 'Float',
    String = 'String',
    SingleSelect = 'SingleSelect',
    MultiSelect = 'MultiSelect',
}

export type CyclingModeProperty = {
    key: string;
    name: string;
    description: string;
    type: CyclingModeProperyType;
    min?: number;
    max?: number;
    default?: any;
    options?: any[];
}

export type IncyclistBikeData = {
    isPedalling: boolean;
    power: number;
    pedalRpm: number;
    speed: number;
    heartrate:number;
    distanceInternal:number;        // Total Distance in meters 
    time?:number;
    gear?:number;
    slope?:number;
}

export type Settings = {
    [key:string]: any;
}


export default interface CyclingMode {

    getName(): string;
    getDescription(): string;
    getBikeInitRequest(): UpdateRequest;
    sendBikeUpdate(request:UpdateRequest): UpdateRequest;
    updateData( data:IncyclistBikeData ): IncyclistBikeData;

    getProperties(): CyclingModeProperty[];
    getProperty(name: string): CyclingModeProperty;

    setSettings(settings: any);
    setSetting(name: string, value: any):void;
    getSetting(name:string):any;
    getSettings():Settings;

    setModeProperty(name: string, value: any):void;
    getModeProperty(name:string):any;

}

export class CyclingModeBase implements CyclingMode {
    adapter: Device;
    settings: Settings = {}
    properties: Settings = {};

    constructor(adapter: Device,props?:any) {
        if (!adapter) throw new Error('IllegalArgument: adapter is null')        
        this.setAdapter(adapter);
        this.setSettings(props);        
    }
    
    setAdapter(adapter: Device) {
        this.adapter = adapter;
    }
    // istanbul ignore next
    getBikeInitRequest(): UpdateRequest {
        return { };
    }    

    // istanbul ignore next
    getName(): string {
        throw new Error("Method not implemented.")
    }
    // istanbul ignore next
    getDescription(): string {
        throw new Error("Method not implemented.")
    }
    // istanbul ignore next
    sendBikeUpdate(request: UpdateRequest): UpdateRequest {
        throw new Error("Method not implemented.")
    }
    // istanbul ignore next
    updateData(data: IncyclistBikeData): IncyclistBikeData {
        throw new Error("Method not implemented.")
    }
    // istanbul ignore next
    getProperties(): CyclingModeProperty[] {
        throw new Error("Method not implemented.")
    }
    // istanbul ignore next
    getProperty(name: string): CyclingModeProperty {
        throw new Error("Method not implemented.")
    }

    setSettings(settings?: any) {
        if (settings) {
            this.settings = settings;
        }
    }
    setSetting(name: string, value: any):void{
        this.settings[name] = value;

    }
    getSetting(name:string):any {
        const res =  this.settings[name];
        if (res!==undefined)
            return res;
        const prop = this.getProperties().find(p => p.key===name);
        if (prop && prop.default!==undefined) 
            return prop.default;
        return undefined;
    }
    getSettings():Settings {
        return this.settings;
    }   

    setModeProperty(name: string, value: any):void{
        this.properties[name] = value;
    }

    getModeProperty(name:string):any { 
        const res =  this.properties[name];
        if (res!==undefined)
            return res;
        const prop = this.getProperties().find(p => p.key===name);
        if (prop && prop.default!==undefined) 
            return prop.default;
        return undefined;
    }


}