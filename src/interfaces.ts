import { InterfaceProps } from "./types/interface";

import { SerialInterface } from "./serial";
import AntInterface, { AntInterfaceProps } from "./antv2/ant-interface";
import { INTERFACE } from "./types/device";
import { SerialInterfaceProps } from "./serial/serial-interface";


export default class InterfaceFactory {

    static create( ifaceName:string, props?:InterfaceProps) {
        switch(ifaceName) {
            case INTERFACE.SERIAL: 
            case INTERFACE.TCPIP:
                const serialProps = props as SerialInterfaceProps
                serialProps.ifaceName = ifaceName
                return SerialInterface.getInstance(serialProps)
            case INTERFACE.ANT:
                const antProps = props as AntInterfaceProps
                return AntInterface.getInstance(antProps)

        }
    }

    
}
