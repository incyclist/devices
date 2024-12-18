import { InterfaceFactory } from "../base/types";
import { IBleInterface } from "../types";

export class BleMultiTransportInterfaceFactory {

    static readonly registered: Record<string, typeof InterfaceFactory> = {}

    static register( transport:string, Class:typeof InterfaceFactory) {
        this.registered[transport] = Class
    }

    static createInstance  ( transport:string):IBleInterface<any>  {

        if (this.registered[transport]) {
            const Class = this.registered[transport]
            const iface = new Class()?.getInterface()
            return iface
        }
    
    }
}

