import { DC_MESSAGE_WRITE_CHARACTERISTIC } from "../consts.js";
import {  TDCBody, TDCRequest, TDCResponse } from "../types.js";
import { Message } from "./message.js";

export type TDCWriteCharacteristicRequest = TDCRequest<TDCWriteCharacteristicRequestBody>
export type TDCWriteCharacteristicResponse = TDCResponse<TDCWriteCharacteristicResponseBody>

export interface TDCWriteCharacteristicRequestBody extends TDCBody {
    characteristicUUID: string; // UUID of the characteristic to write
    characteristicData: Uint8Array; // Characteristic value data to write
}
export interface TDCWriteCharacteristicResponseBody extends TDCBody {
    characteristicUUID: string; // UUID of the characteristic being written
}



export class WriteCharacteristicMessage extends Message<TDCWriteCharacteristicRequestBody,TDCWriteCharacteristicResponseBody> {

    constructor() {
        super(DC_MESSAGE_WRITE_CHARACTERISTIC)
    }

    buildRequestBody  (body: TDCWriteCharacteristicRequestBody): Buffer {       
        return Buffer.concat([
            Buffer.from(body.characteristicUUID, "hex"),
            Buffer.from(body.characteristicData),
        ]);        
    }

    buildResponseBody  (body: TDCWriteCharacteristicResponseBody): Buffer {       
        return Buffer.concat([
            Buffer.from(body.characteristicUUID, "hex"),
        ]);
    }


    parseRequestBody(body: Buffer): TDCWriteCharacteristicRequestBody {
        const characteristicUUID = Buffer.from(body.subarray(0, 16)).toString("hex");
        const characteristicData = body.subarray(16, body.length);
    
        return {
            characteristicUUID,
            characteristicData,
        };
        
    }
    parseResponseBody(body: Buffer): TDCWriteCharacteristicResponseBody {
        const characteristicUUID = Buffer.from(body.subarray(0, 16)).toString("hex");
    
        return {
            characteristicUUID,
        };
        
    }

}

