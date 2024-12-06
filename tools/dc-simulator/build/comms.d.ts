import { Socket } from "net";
import { Service } from './emulator/services';
import { DiscoverCharacteristicsMessage, DiscoverServiceMessage, EnableCharacteristicNotificationsMessage, ReadCharacteristicMessage, WriteCharacteristicMessage } from 'incyclist-devices';
export declare class DirectConnectComms {
    protected onDataHandler: any;
    protected socket: Socket;
    protected services: Service[];
    protected lastMessageId: number;
    constructor(socket: Socket, services: Service[]);
    write: (respBuffer: any) => void;
    onData(data: any): void;
    handleDiscoverServices(buffer: any, message: DiscoverServiceMessage): void;
    handleDiscoverCharacteristics(buffer: any, message: DiscoverCharacteristicsMessage): void;
    handleReadCharacteristic(buffer: any, message: ReadCharacteristicMessage): void;
    handleWriteCharacteristic(buffer: any, message: WriteCharacteristicMessage): void;
    enableCharacteristicNotifications(buffer: Buffer, message: EnableCharacteristicNotificationsMessage): void;
    notify(characteristicUUID: string, characteristicData: Buffer): void;
}
