import { SerialIncyclistDevice, SerialDeviceSettings } from './adapter';


export default class SerialAdapterFactory {
    static _instance:SerialAdapterFactory;
    adapters: {protocol:string, AdapterClass:typeof SerialIncyclistDevice}[]

    static getInstance(): SerialAdapterFactory {
        if (!SerialAdapterFactory._instance)
            SerialAdapterFactory._instance = new SerialAdapterFactory() ;
        return SerialAdapterFactory._instance;
    }
    constructor() {
        this.adapters = []
    }

    registerAdapter( protocol:string, AdapterClass:typeof SerialIncyclistDevice):void {
        const existing = this.adapters.findIndex( a => a.protocol===protocol)
        if (existing!==-1)
            this.adapters[existing].AdapterClass = AdapterClass
        else 
            this.adapters.push({protocol,AdapterClass})
    }

    createInstance(props:SerialDeviceSettings,settings?) {
        const {protocol} = props;
        if (!protocol)
            return null;
        const adapter = this.adapters.find( a => a.protocol===protocol)
        if (!adapter)
            return null;
        const {AdapterClass} = adapter
        return new AdapterClass(props,settings)

    }
}


