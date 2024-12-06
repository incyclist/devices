import { DC_MESSAGE_ENABLE_CHARACTERISTIC_NOTIFICATIONS } from "../consts";
import { TDCBody, TDCRequest, TDCResponse } from "../types";
import { Message } from "./message";

export type TDCEnableCharacteristicNotificationsRequest = TDCRequest<TDCEnableCharacteristicNotificationsRequestBody>
export type TDCEnableCharacteristicNotificationsResponse = TDCResponse<TDCEnableCharacteristicNotificationsResponseBody>
export interface TDCEnableCharacteristicNotificationsRequestBody extends TDCBody {
    characteristicUUID: string; // UUID of the characteristic to read
    enable: boolean
}
export interface TDCEnableCharacteristicNotificationsResponseBody extends TDCBody {
    characteristicUUID: string; // UUID of the characteristic specified in the request
}

export class EnableCharacteristicNotificationsMessage extends Message<TDCEnableCharacteristicNotificationsRequestBody,TDCEnableCharacteristicNotificationsResponseBody> {

    constructor() {
        super(DC_MESSAGE_ENABLE_CHARACTERISTIC_NOTIFICATIONS)
    }

    buildRequestBody(body: TDCEnableCharacteristicNotificationsRequestBody): Buffer {
        const enabledVal = body.enable ? 1 : 0;

        return Buffer.concat([
            Buffer.from(body.characteristicUUID, "hex"), 
            Buffer.from([enabledVal])
        ])
    }

    buildResponseBody  (body: TDCEnableCharacteristicNotificationsResponseBody): Buffer {       
        return Buffer.from(body.characteristicUUID, "hex");       
    }

    parseRequestBody(body: Buffer): TDCEnableCharacteristicNotificationsRequestBody {
        const characteristicUUID = body.subarray(0, 16).toString("hex");
        const enabledVal = body.readUInt8(16);
        const enable = enabledVal !== 0;
    
        return {
            characteristicUUID, enable
        };
        
    }
    parseResponseBody(body: Buffer): TDCEnableCharacteristicNotificationsResponseBody {
        const characteristicUUID = body.subarray(0, 16).toString("hex");
    
        return {
            characteristicUUID,
        };
        
    }


}

