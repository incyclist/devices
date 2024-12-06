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


// Message ID: 0x01
// msgId: 2; // Discover Characteristics message identifier


// msgId: 3; // Read Characteristic message identifier

// msgId: 4; // Write Characteristic message identifier

// msgId: 5; // Enable Characteristic Notifications

