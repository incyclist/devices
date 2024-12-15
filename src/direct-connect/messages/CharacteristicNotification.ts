import { DC_MESSAGE_CHARACTERISTIC_NOTIFICATION } from "../consts";
import { EmptyBody, TDCBody, TDCResponse } from "../types";
import { Message } from "./message";

export type TDCCharacteristicNotification = TDCResponse<TDCCharacteristicNotificationBody>
export interface TDCCharacteristicNotificationBody extends TDCBody {
    characteristicUUID: string; // UUID of the characteristic issuing the notification
    characteristicData: Uint8Array; // New characteristic value data
}


export class CharacteristicNotificationMessage extends Message<EmptyBody,TDCCharacteristicNotificationBody> {

    constructor(seqNum?:number) {
        super(DC_MESSAGE_CHARACTERISTIC_NOTIFICATION)
    }
    buildResponseBody  (body: TDCCharacteristicNotificationBody): Buffer {       
        return Buffer.concat(
                [Buffer.from(body.characteristicUUID, "hex"),
                Buffer.from(body.characteristicData)]
                )       
    }

    parseResponseBody(body: Buffer): TDCCharacteristicNotificationBody {
        const characteristicUUID = Buffer.from(body.subarray(0, 16)).toString("hex");
        const characteristicData = body.subarray(16, body.length);
    
        return {
            characteristicUUID,
            characteristicData,
        };
        
    }



}

