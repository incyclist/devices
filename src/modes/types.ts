import { IAdapter,IncyclistBikeData } from "../types";


export type UpdateRequest = {
    slope?: number;
    minPower?: number;
    maxPower?: number;
    targetPower?: number;
    targetPowerDelta?: number;
    gearDelta?: number;
    reset?: boolean;
    refresh?: boolean;
    init?: boolean;
    gear?: number;
    gearRatio?: number,
    forced?:boolean
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
    condition?: (setting:any)=>boolean
}

export type Settings = {
    [key:string]: any;
}


export default interface ICyclingMode {

    getName(): string;
    getDescription(): string;
    getProperties(): CyclingModeProperty[];
    getProperty(name: string): CyclingModeProperty;


    getBikeInitRequest(): UpdateRequest;
    buildUpdate(request:UpdateRequest): UpdateRequest;
    updateData( data:IncyclistBikeData ): IncyclistBikeData;


    setSettings(settings: any);
    setSetting(name: string, value: any):void;
    getSetting(name:string):any;
    getSettings():Settings;

    setModeProperty(name: string, value: any):void;
    getModeProperty(name:string):any;

    getData():Partial<IncyclistBikeData>;

}

export type CyclingModeConfig = {
    isERG?:boolean
    isSIM?:boolean,
    name: string,
    description: string,
    properties: CyclingModeProperty[]
}


export class CyclingMode implements ICyclingMode {

    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(_adapter:IAdapter,_props?:any ) {}
    static supportsERGMode():boolean  { return false}
    
    getName(): string {
        throw new Error("Method not implemented.");
    }
    getDescription(): string {
        throw new Error("Method not implemented.");
    }
    getProperties(): CyclingModeProperty[] {
        throw new Error("Method not implemented.");
    }
    getProperty(_name: string): CyclingModeProperty {
        throw new Error("Method not implemented.");
    }
    getBikeInitRequest(): UpdateRequest {
        throw new Error("Method not implemented.");
    }
    buildUpdate(_request: UpdateRequest): UpdateRequest {
        throw new Error("Method not implemented.");
    }
    updateData(_data: IncyclistBikeData): IncyclistBikeData {
        throw new Error("Method not implemented.");
    }
    setSettings(_settings: any) {
        throw new Error("Method not implemented.");
    }
    setSetting(_name: string, _value: any): void {
        throw new Error("Method not implemented.");
    }
    getSetting(_name: string) {
        throw new Error("Method not implemented.");
    }
    getSettings(): Settings {
        throw new Error("Method not implemented.");
    }
    setModeProperty(_name: string, _value: any): void {
        throw new Error("Method not implemented.");
    }
    getModeProperty(_name: string) {
        throw new Error("Method not implemented.");
    }

    getConfig():CyclingModeConfig {
        throw new Error("Method not implemented.");
    } 

    isERG():boolean {
        return this.getConfig().isERG
    }
    isSIM():boolean {
        return this.getConfig().isSIM

    }

    getData(): Partial<IncyclistBikeData> {
        return {}
    }

}
