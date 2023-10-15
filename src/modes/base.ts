import { IncyclistBikeData, IAdapter } from "../types";
import ICyclingMode, { CyclingMode, CyclingModeConfig, CyclingModeProperty, Settings, UpdateRequest } from "./types";

export abstract class CyclingModeBase extends CyclingMode implements ICyclingMode {
    adapter: IAdapter
    settings: Settings = {}
    properties: Settings = {};
    localConfig: CyclingModeConfig;
    protected static config:CyclingModeConfig={name:'',description:'',properties:[]}
    protected static isERG:boolean

    static supportsERGMode():boolean  {
        //let cm = this.constructor as typeof CyclingModeBase
        return this.config.isERG===true
    }

    constructor(adapter: IAdapter, props?:any) {
        super(adapter,props)

        this.setAdapter(adapter);
        this.setSettings(props);        
        
    }
    
    setAdapter(adapter: IAdapter) {
        this.adapter = adapter;
    }

    setConfig(config:CyclingModeConfig):void {
        this.localConfig = config
    }

    getConfig():CyclingModeConfig {
        if (this.localConfig)
            return this.localConfig

        let cm = this.constructor as typeof CyclingModeBase
        return cm.config
    }

    getName(): string {
        return this.getConfig().name;
    }
    getDescription(): string {
        return this.getConfig().description;
    }
    getProperties(): CyclingModeProperty[] {
        return this.getConfig().properties;
    }
    getProperty(name: string): CyclingModeProperty {
        return this.getConfig().properties.find(p => p.name===name);
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
        
        return this.getSettingDefault(name)        
    }

    getSettingDefault(name:string):any {
        const prop = this.getProperties().find(p => p.key===name);
        if (prop && prop.default!==undefined) 
            return prop.default;
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


    // =================================================
    // TO BE IMPLEMENTED BY SUBCLASSES

    abstract getBikeInitRequest(): UpdateRequest 
    
    abstract sendBikeUpdate(request: UpdateRequest): UpdateRequest 

    abstract updateData(data: IncyclistBikeData): IncyclistBikeData 


    // =================================================

}