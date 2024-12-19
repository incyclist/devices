import { IncyclistScanProps } from "../types"

export interface TDCMessageHeader {
    msgVersion: number
    msgId: number
    seqNum: number
    respCode: number
    length: number
}

export interface TDCBody {}


export class TDCRequest<T extends TDCBody>  {
    public header: TDCMessageHeader
    public body: T
}

export class TDCResponse<T extends TDCBody>  {
    public header: TDCMessageHeader
    public body: T
}


export interface EmptyBody extends TDCBody {
}

export interface DirectConnectScanProps extends IncyclistScanProps{
    serviceUUID?: string
    serviceUUIDs?: string[]       
}


