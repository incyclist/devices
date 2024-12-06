import { DC_MESSAGE_READ_CHARACTERISTIC } from "../consts";
import { EmptyBody, TDCBody, TDCRequest, TDCResponse } from "../types";
import { Message } from "./message";

export type TDCReadCharacteristicRequest = TDCRequest<TDCReadCharacteristicRequestBody>
export type TDCReadCharacteristicResponse = TDCResponse<TDCReadCharacteristicResponseBody>

export interface TDCReadCharacteristicRequestBody extends TDCBody {
    characteristicUUID: string; // UUID of the characteristic to read
}
export interface TDCReadCharacteristicResponseBody extends TDCBody {
    characteristicUUID: string; // UUID of the characteristic being read
    characteristicData: Uint8Array; // Characteristic value data
}


export class ReadCharacteristicMessage extends Message<TDCReadCharacteristicRequestBody,TDCReadCharacteristicResponseBody> {

    constructor() {
        super(DC_MESSAGE_READ_CHARACTERISTIC)
    }

    buildRequestBody(body: TDCReadCharacteristicRequestBody): Buffer {
        return Buffer.from(body.characteristicUUID, "hex")
    }

    buildResponseBody  (body: TDCReadCharacteristicResponseBody): Buffer {       
        return Buffer.concat([
            Buffer.from(body.characteristicUUID, "hex"),
            Buffer.from(body.characteristicData),
        ]);        
    }


    parseRequestBody(body: Buffer): TDCReadCharacteristicRequestBody {
        const characteristicUUID = body.subarray(0, 16).toString("hex");
    
        return {
            characteristicUUID,
        };
        
    }

    parseResponseBody(body: Buffer): TDCReadCharacteristicResponseBody {
        const characteristicUUID = body.subarray(0, 16).toString("hex");
        const characteristicData = body.subarray(16, body.length);
    
        return {
            characteristicUUID,
            characteristicData,
        };
        
    }

    

}

