import { DC_ERROR_INVALID_MESSAGE_TYPE, DC_MESSAGE_DISCOVER_SERVICES } from "../consts";
import { EmptyBody, TDCBody, TDCMessageHeader, TDCRequest, TDCResponse } from "../types";
import { IllegalMessageError } from "./error";
import { Message } from "./message";

export type TDCDiscoverServicesRequest = TDCRequest<EmptyBody>
export type TDCDiscoverServicesResponse = TDCResponse<TDCDiscoverServicesResponseBody>
export interface TDCDiscoverServicesResponseBody extends TDCBody {
    serviceDefinitions: Array<{ serviceUUID: string }>; // List of service definitions
}


export class DiscoverServiceMessage extends Message<EmptyBody,TDCDiscoverServicesResponseBody> {

    constructor() { 
        super(DC_MESSAGE_DISCOVER_SERVICES)
    }

    buildResponseBody  (body: TDCDiscoverServicesResponseBody): Buffer {
        const serviceBuffers = body.serviceDefinitions.map((service) => {
            return Buffer.from(service.serviceUUID, "hex");
        });
        return Buffer.concat(serviceBuffers);        
    }

    parseResponseBody(body: Buffer): TDCDiscoverServicesResponseBody {
        const serviceDefinitions = [];
        const length = body.length;
        for (let i = 0; i < length; i += 16) {
            const serviceUUID = body.subarray(i, i + 16).toString("hex");
            serviceDefinitions.push({ serviceUUID });
        }

        return {serviceDefinitions }
    }



    verifyHeader(header:TDCMessageHeader):boolean {
        if (header.msgId !== DC_MESSAGE_DISCOVER_SERVICES) {
            throw new IllegalMessageError(DC_ERROR_INVALID_MESSAGE_TYPE)
        }
        return super.verifyHeader(header)
    }


}

