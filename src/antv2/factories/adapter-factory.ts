import { Profile } from "incyclist-ant-plus";
import AntAdapter from "../base/adapter.js";
import { AntDeviceProperties, AntDeviceSettings, LegacyProfile,BaseDeviceData,AntAdapterInfo, AdapterQuery } from "../types.js";


export default class AntAdapterFactory {

    protected static _instance:AntAdapterFactory|undefined;
    protected adapters: AntAdapterInfo[]
    
    static getInstance(): AntAdapterFactory {
        if (!AntAdapterFactory._instance)
            AntAdapterFactory._instance = new AntAdapterFactory() ;
        return AntAdapterFactory._instance;
    }
    constructor() {
        this.adapters = []
    }
    

    register<TDeviceData extends BaseDeviceData>(antProfile: Profile, incyclistProfile: LegacyProfile, Adapter: typeof AntAdapter<TDeviceData>) { 

        const info = Object.assign({},{antProfile, incyclistProfile, Adapter})
        const existing = this.adapters.findIndex( a => a.antProfile===antProfile) 

        if (existing!==-1)
            this.adapters[existing]= info;
        else    
            this.adapters.push(info)

    }

    // for testing only
    _getAll():AntAdapterInfo[] {
        return this.adapters;
    }

    getAdapter(query?:AdapterQuery) {
        const {antProfile, incyclistProfile} = query
        if (!antProfile && !incyclistProfile)
            throw new Error('Illegal arguments: either "antProfile" or "incyclistProfile" must be set')
        
        let found;
        if (antProfile) 
            found = this.adapters.find(a=>a.antProfile===antProfile) 
        if (!found && incyclistProfile) 
            found = this.adapters.find(a=>a.incyclistProfile===incyclistProfile) 

        return found
    }  

    createInstance(settings:AntDeviceSettings,props?:AntDeviceProperties) {
        let info
        const {profile,protocol} = settings

        let isLegacy = false;
        if (protocol) { // legacy settings
        
            try {
                const incyclistProfile = profile as LegacyProfile
                info = this.getAdapter({incyclistProfile})               
                isLegacy = (info!==undefined && info!==null)
            }
            catch {
                return
            }
        }

        if (!isLegacy) {
            const antProfile = profile as Profile
            try {
                info = this.getAdapter({antProfile})   
            }
            catch {}
        }

        if (info && info.Adapter) {
            const {deviceID,interface: ifName} = settings
            const {antProfile} = info
            return new info.Adapter({profile:antProfile, interface:ifName, deviceID},props)
        }
    }

    createFromDetected(profile:Profile, deviceID:number, props?:AntDeviceProperties )  {
        const info = this.getAdapter({antProfile:profile})
        if (!info || !info.Adapter)
            return;
        
        const settings:AntDeviceSettings = Object.assign( {}, {
            profile: info.antProfile,
            deviceID:deviceID.toString(),
            interface: 'ant'
        })
        return new info.Adapter(settings,props)
    }


}