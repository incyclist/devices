import { IDeviceBinding } from "./types"

export class BindingsFactory {
    protected static instance: BindingsFactory 
    protected binding:IDeviceBinding|undefined

    static getInstance():BindingsFactory {
        this.instance = this.instance ?? new BindingsFactory()
        return this.instance
    }

    getBinding():IDeviceBinding|undefined {
        return this.binding;
    }

    setBinding( binding:IDeviceBinding) {
        this.binding = binding
    }
    
}