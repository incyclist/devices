import { DC_ERROR_INVALID_MESSAGE_LENGTH, DC_ERROR_UNKNOWN_MESSAGE_TYPE, DC_MESSAGE_CHARACTERISTIC_NOTIFICATION, DC_MESSAGE_DISCOVER_CHARACTERISTICS, DC_MESSAGE_DISCOVER_SERVICES, DC_MESSAGE_ENABLE_CHARACTERISTIC_NOTIFICATIONS, DC_MESSAGE_READ_CHARACTERISTIC, DC_MESSAGE_WRITE_CHARACTERISTIC } from "../consts.js";
import { CharacteristicNotificationMessage } from "./CharacteristicNotification.js";
import { DiscoverCharacteristicsMessage } from "./DiscoverCharacteristics.js";
import { DiscoverServiceMessage } from "./DiscoverServices.js";
import { EnableCharacteristicNotificationsMessage } from "./EnableCharacteristicNotifications.js";
import { IllegalMessageError } from "./error.js";
import { Message } from "./message.js";
import { ReadCharacteristicMessage } from "./ReadCharacteristic.js";
import { WriteCharacteristicMessage } from "./WriteCharacteristic.js";

export class DCMessageFactory {

    static createMessage(buffer:Buffer):Message<any,any> {
        if (buffer.length < 6) {
            throw new IllegalMessageError(DC_ERROR_INVALID_MESSAGE_LENGTH)  
        }
        const msgId = buffer.readUInt8(1);
        return this.create(msgId)
    }

    static create(msgId:number):Message<any,any> {
        switch (msgId) {
            case DC_MESSAGE_DISCOVER_SERVICES:
                return new DiscoverServiceMessage();
            case DC_MESSAGE_DISCOVER_CHARACTERISTICS:
                return new DiscoverCharacteristicsMessage();
            case DC_MESSAGE_READ_CHARACTERISTIC:
                return new ReadCharacteristicMessage();
            case DC_MESSAGE_WRITE_CHARACTERISTIC:
                return new WriteCharacteristicMessage();
            case DC_MESSAGE_ENABLE_CHARACTERISTIC_NOTIFICATIONS:
                return new EnableCharacteristicNotificationsMessage();
            case DC_MESSAGE_CHARACTERISTIC_NOTIFICATION:
                return new CharacteristicNotificationMessage();
            default:
                throw new IllegalMessageError(DC_ERROR_UNKNOWN_MESSAGE_TYPE)
        }
    }

    static buildErrorResponse(request:Buffer, code:number):Buffer {
        const response = Buffer.from (request)
        response.writeUInt8(code, 3)
        return response
        
    }
}