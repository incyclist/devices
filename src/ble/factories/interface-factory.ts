import DirectConnectInterface from "../../direct-connect/base/interface";
import { BleInterface } from "../base/interface";
import { IBleInterface } from "../types";

export class BleInterfaceFactory {

    static createInstane  ( transport:string):IBleInterface<any>  {

        if (transport === 'ble') {
        
            return BleInterface.getInstance()
        }
        else if (transport === 'wifi') {

            return DirectConnectInterface.getInstance()
        }
    
    }
}

