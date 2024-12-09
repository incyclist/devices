import { DC_ERROR_INVALID_MESSAGE_LENGTH, DC_ERROR_INVALID_MESSAGE_TYPE } from "../consts";
import { EmptyBody, TDCBody, TDCMessageHeader, TDCRequest, TDCResponse } from "../types";
import { IllegalMessageError } from "./error";

export class Message<TReq extends TDCBody,TRes extends TDCBody > {

    protected request: TDCRequest<TReq>
    protected response: TDCResponse<TRes>

    constructor(public msgId?: number) {}

    
    
    buildResponse(response: TDCResponse<TRes>): Buffer {

        const {header,body}=response
        // Dynamically build the body based on msgId
        const bodyBuffer = this.buildResponseBody(body);
        const headerBuffer = this.buildHeader(header, bodyBuffer.length);
    
        // Combine the header and body
        return Buffer.concat([headerBuffer, bodyBuffer]);
    }

    buildRequest(request: TDCRequest<TReq>): Buffer {

        const {header,body}=request
    
    
        // Dynamically build the body based on msgId
        const bodyBuffer = this.buildRequestBody(body);
        const headerBuffer = this.buildHeader(header, bodyBuffer.length);
    
        // Combine the header and body
        return Buffer.concat([headerBuffer, bodyBuffer]);
    }

    createRequest(seqNum, body:TReq):Buffer {
        
        const header = {
            msgId:this.msgId,
            seqNum,
            respCode: 0,
            msgVersion: 1,
            length:0
        }
        
        return this.buildRequest({header,body})        
    
    }


    parseRequest(buffer:Buffer):TDCRequest<TReq> {
        const header = parseHeader(buffer)
        this.verifyHeader(header)
        const bodyBuffer = buffer.subarray(6)

        const body = this.parseRequestBody(bodyBuffer)
        
        return {header,body}
    }

    prepareResponse(request:TDCRequest<TReq>, respCode:number, body:TRes):TDCResponse<TRes> {   

        const header = {...request.header,respCode} 
        return {header,body}
    }

    parseResponse(buffer:Buffer):TDCResponse<TRes> {
        const header = parseHeader(buffer)
        this.verifyHeader(header)
        const bodyBuffer = buffer.subarray(6)

        const body = this.parseResponseBody(bodyBuffer)
        return {header,body}
    }


    buildHeader(header:TDCMessageHeader, length: number):Buffer {
        const buffer = Buffer.alloc(6);
    
        // Write the header
        buffer.writeUInt8(header.msgVersion, 0); // Message Version
        buffer.writeUInt8(header.msgId, 1);      // Message ID
        buffer.writeUInt8(header.seqNum, 2);     // Sequence Number
        buffer.writeUInt8(header.respCode, 3);   // Response Code
        buffer.writeUInt16BE(length??header.length, 4);  // Length of the message body

        return buffer
    }

    buildResponseBody  (body: TRes): Buffer {
        return Buffer.from([])
    }

    buildRequestBody  (body: TReq): Buffer {
        return Buffer.from([])
    }


    verifyHeader(header:TDCMessageHeader):boolean {
        if (header.msgId !== this.msgId) {
            throw new IllegalMessageError(DC_ERROR_INVALID_MESSAGE_TYPE)
        }
        return true
    
    }

    parseRequestBody(body:Buffer):TReq { 
        return {} as TReq
    }
    parseResponseBody(body:Buffer):TRes { 
        return {} as TRes
    }

}

export const  parseHeader  = (buffer:Buffer):TDCMessageHeader => {
    if (buffer.length < 6) {
        throw new IllegalMessageError(DC_ERROR_INVALID_MESSAGE_LENGTH)
    }
    const msgVersion = buffer.readUInt8(0);
    const msgId = buffer.readUInt8(1);
    const seqNum = buffer.readUInt8(2);
    const respCode = buffer.readUInt8(3); // Response Code
    const length = buffer.readUInt16BE(4); // Length of the message body
    return { msgVersion, msgId, seqNum, respCode, length }
}

