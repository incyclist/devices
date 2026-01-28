import { InterfaceProps } from "../types/interface.js";

import { SerialInterface } from "../serial/index.js";
import AntInterface from "../antv2/base/interface.js";
import { AntInterfaceProps } from "../antv2/types.js";
import { INTERFACE } from "../types/device.js";
import { SerialInterfaceProps } from "../serial/types.js";
import { BleInterfaceProps } from "../ble/types.js";
import { BleInterface } from "../ble/index.js";
import DirectConnectInterface from "../direct-connect/base/interface.js";


export default class InterfaceFactory {

    static create( ifaceName:string, props?:InterfaceProps) {

        console.log('# create interface',ifaceName, props)
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
