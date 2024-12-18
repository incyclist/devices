import EventEmitter from "events"
import { PeripheralAnnouncement } from "../../ble/types"

export interface Socket extends EventEmitter {
    connect(port: number, host:string): Socket
    destroy(): void
    write(data:Buffer):boolean
}

export interface NetBinding {
    createSocket(): Socket
}


export interface DirectConnectBinding {
    mdns: MulticastDnsBinding
    net:NetBinding
}

type KeyValue = { [key: string]: any }

export interface BrowserConfig {
    type        : string
    name?       : string
    protocol?   : 'tcp' | 'udp'
    subtypes?   : string[]
    txt?        : KeyValue
}

export interface MulticastDnsAnnouncement extends PeripheralAnnouncement{
    address     : string
    protocol?   : 'tcp' | 'udp'
    port        : number
    serialNo?   : string
}

export interface MulticastDnsBinding {

    connect(): void

    disconnect(): void      

    /**
     * Find services on the network with options
     * @param opts BrowserConfig
     * @param onup Callback when service up event received
     * @returns
     */
    find(opts: BrowserConfig | null, onup?: (service: MulticastDnsAnnouncement) => void): void
}