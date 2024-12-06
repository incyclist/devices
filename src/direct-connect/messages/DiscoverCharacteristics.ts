import { BleProperty } from "../../ble/types";
import { DC_MESSAGE_DISCOVER_CHARACTERISTICS } from "../consts";
import { TDCBody, TDCRequest, TDCResponse } from "../types";
import { Message } from "./message";
import { propertyFromVal, propertyVal } from "../utils";

export type TDCDiscoverCharacteristicsRequest = TDCRequest<TDCDiscoverCharacteristicsRequestBody>
export type TDCDiscoverCharacteristicsResponse = TDCResponse<TDCDiscoverCharacteristicsResponseBody>

export interface TDCDiscoverCharacteristicsRequestBody extends TDCBody {
    serviceUUID: string; // UUID of the parent service
}

export interface TDCDiscoverCharacteristicsResponseBody extends TDCBody {
    serviceUUID: string; // UUID of the parent service
    characteristicDefinitions: Array<{
        characteristicUUID: string;
        properties: BleProperty[]; // Characteristic properties as a bit field
    }>; // List of characteristic definitions
}


export class DiscoverCharacteristicsMessage extends Message<TDCDiscoverCharacteristicsRequestBody,TDCDiscoverCharacteristicsResponseBody> {

    constructor() {
        super(DC_MESSAGE_DISCOVER_CHARACTERISTICS)
    }


    parseRequestBody(body: Buffer): TDCDiscoverCharacteristicsRequestBody {
        const serviceUUID = body.subarray(0, 16).toString("hex");
    
        return {
            serviceUUID,
        };        
    }

    buildRequestBody  (body: TDCDiscoverCharacteristicsRequestBody): Buffer {       
        return Buffer.from(body.serviceUUID, "hex");       
    }


    buildResponseBody  (body: TDCDiscoverCharacteristicsResponseBody): Buffer {       
        const serviceUUIDBuffer = Buffer.from(body.serviceUUID, "hex");
        const characteristicBuffers = body.characteristicDefinitions.map((charDef) =>
            Buffer.concat([
                Buffer.from(charDef.characteristicUUID, "hex"),
                Buffer.from([propertyVal(charDef.properties)]),
            ])
        );
        return Buffer.concat([serviceUUIDBuffer, ...characteristicBuffers]);
    }

    parseResponseBody(body: Buffer): TDCDiscoverCharacteristicsResponseBody {
        const length = body.length;

        const serviceUUID = body.subarray(0, 16).toString("hex");
        const characteristicDefinitions = [];
        for (let i = 16; i < length; i += 17) {
            const characteristicUUID = body.subarray(i, i + 16).toString("hex");
            const properties = propertyFromVal(body.readUInt8(i + 16));
            characteristicDefinitions.push({ characteristicUUID, properties });
        }
    
        return {
            serviceUUID,
            characteristicDefinitions,
        };
    
    }


}

