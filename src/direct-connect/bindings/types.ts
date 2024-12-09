import { PeripheralAnnouncement } from "../../ble/types"



export interface DirectConnectBinding {
    mdns: MulticastDnsBinding
    net
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