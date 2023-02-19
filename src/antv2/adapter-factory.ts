
import AntAdapter from "./adapter";
import { AntDeviceProperties, AntDeviceSettings } from "./types";


export type AntAdapterInfo = {
    antProfile: string,
    incyclistProfile: string,
    Adapter: typeof AntAdapter
}

export type AdapterQuery = {
    antProfile?: string,
    incyclistProfile?: string,    
}

export default class AntAdapterFactory {
    static _instance:AntAdapterFactory;

    adapters: AntAdapterInfo[]

    static getInstance(): AntAdapterFactory {
        if (!AntAdapterFactory._instance)
            AntAdapterFactory._instance = new AntAdapterFactory() ;
        return AntAdapterFactory._instance;
    }
    constructor() {
        this.adapters = []
    }

    register( antProfile: string, incyclistProfile: string, Adapter: typeof AntAdapter)  {       

        const info = Object.assign({},{antProfile, incyclistProfile, Adapter})
        const existing = this.adapters.findIndex( a => a.antProfile===antProfile) 

        if (existing!==-1)
            this.adapters[existing]= info;
        else    
            this.adapters.push(info)

    }

    getAdapter(query?:AdapterQuery) {
        const {antProfile, incyclistProfile} = query
        if (!antProfile && !incyclistProfile)
            throw new Error('Illegal arguments: either "antProfile" or "incyclistProfile" must be set')
        
        let found;
        if (antProfile) 
            found = this.adapters.find(a=>a.antProfile===antProfile) 
        if (incyclistProfile) 
            found = this.adapters.find(a=>a.incyclistProfile===incyclistProfile) 

        return found
    }  

    createInstance(settings:AntDeviceSettings,props?:AntDeviceProperties) {
        let info
        const {profile,protocol} = settings
        if (protocol) { // legacy settings
            info = this.getAdapter({incyclistProfile:profile})
        }
        else {
            info = this.getAdapter({antProfile:profile})
    
        }
        if (info && info.Adapter)
            return new info.Adapter(settings,props)
    }

    createFromDetected(profile:string, deviceID:number, props?:AntDeviceProperties )  {
        const info = this.getAdapter({antProfile:profile})
        if (!info || !info.Adapter)
            return;
        
        const settings:AntDeviceSettings = Object.assign( {}, {
            profile: info.incyclistProfile,
            deviceID:deviceID.toString(),
            interface: 'ant',
            protocol:'Ant'
        })
        return new info.Adapter(settings,props)
    }


}