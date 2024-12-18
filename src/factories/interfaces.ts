import { InterfaceProps } from "../types/interface";

import { SerialInterface } from "../serial";
import AntInterface from "../antv2/base/interface";
import { AntInterfaceProps } from "../antv2/types";
import { INTERFACE } from "../types/device";
import { SerialInterfaceProps } from "../serial/types";
import { BleInterfaceProps } from "../ble/types";
import { BleInterface } from "../ble";
import DirectConnectInterface from "../direct-connect/base/interface";


export default class InterfaceFactory {

    static create( ifaceName:string, props?:InterfaceProps) {
        switch(ifaceName) {
            case INTERFACE.SERIAL: 
            case INTERFACE.TCPIP:
                {
                    const serialProps = (props||{}) as SerialInterfaceProps
                    serialProps.ifaceName = ifaceName
                    return SerialInterface.getInstance(serialProps)
                }
            case INTERFACE.ANT:                
                return AntInterface.getInstance(props as AntInterfaceProps)
            case INTERFACE.BLE:                
                return BleInterface.getInstance(props as BleInterfaceProps)
            case INTERFACE.DC:                
                return DirectConnectInterface.getInstance(props)

        }
    }

    
}
