"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DirectConnectComms = void 0;
const incyclist_devices_1 = require("incyclist-devices");
class DirectConnectComms {
    constructor(socket, services) {
        this.lastMessageId = 0;
        this.write = (respBuffer) => {
            const socket = this.socket;
            console.log(socket.remoteAddress + "< ", respBuffer.toString('hex'));
            socket.write(respBuffer);
        };
        this.socket = socket;
        this.services = services.filter(s => s !== undefined);
        this.onDataHandler = this.onData.bind(this);
        socket.on('data', this.onDataHandler);
        socket.on('error', (err) => {
            console.log('server:error ', err);
        });
        socket.on('connect', () => { console.log('connected: ', socket.remoteAddress); });
        socket.on('close', () => { console.log('closed', socket.remoteAddress); });
        socket.on('ready', () => { console.log('ready'); });
        socket.on('connectionAttempt', () => { console.log('connectionAttempt'); });
    }
    onData(data) {
        const socket = this.socket;
        const buffer = Buffer.from(data);
        console.log(socket.remoteAddress + "> ", buffer.toString('hex'));
        try {
            const message = incyclist_devices_1.DCMessageFactory.createMessage(buffer);
            this.lastMessageId = buffer.readUInt8(2);
            switch (message.msgId) {
                case incyclist_devices_1.DC_MESSAGE_DISCOVER_SERVICES:
                    this.handleDiscoverServices(buffer, message);
                    break;
                case incyclist_devices_1.DC_MESSAGE_DISCOVER_CHARACTERISTICS:
                    this.handleDiscoverCharacteristics(buffer, message);
                    break;
                case incyclist_devices_1.DC_MESSAGE_READ_CHARACTERISTIC:
                    this.handleReadCharacteristic(buffer, message);
                    break;
                case incyclist_devices_1.DC_MESSAGE_WRITE_CHARACTERISTIC:
                    this.handleWriteCharacteristic(buffer, message);
                    break;
                case incyclist_devices_1.DC_MESSAGE_ENABLE_CHARACTERISTIC_NOTIFICATIONS:
                    this.enableCharacteristicNotifications(buffer, message);
                    break;
                default: {
                    const request = message.parseRequest(buffer);
                    console.log('request:', message.msgId, request);
                }
            }
        }
        catch (err) {
            console.log(err);
            if (err instanceof incyclist_devices_1.IllegalMessageError) {
                const respBuffer = incyclist_devices_1.DCMessageFactory.buildErrorResponse(buffer, err.code);
                this.write(respBuffer);
            }
        }
    }
    handleDiscoverServices(buffer, message) {
        const request = message.parseRequest(buffer);
        console.log('handleDiscoverServices', request, 'services:', this.services.map(s => s.uuid).join(','));
        const serviceDefinitions = ['0x1818', '0x1826'].map((uuid) => ({ serviceUUID: (0, incyclist_devices_1.parseUUID)(uuid) }));
        const body = { serviceDefinitions };
        const response = message.prepareResponse(request, incyclist_devices_1.DC_RC_REQUEST_COMPLETED_SUCCESSFULLY, body);
        const respBuffer = message.buildResponse(response);
        this.write(respBuffer);
    }
    handleDiscoverCharacteristics(buffer, message) {
        const request = message.parseRequest(buffer);
        console.log('handleDiscoverCharacteristics', request.body);
        const { serviceUUID } = request.body;
        let found = false;
        this.services.forEach(s => {
            if ((0, incyclist_devices_1.parseUUID)(s.uuid) === (0, incyclist_devices_1.parseUUID)(serviceUUID)) {
                const characteristicDefinitions = s.characteristics.map((c) => ({ characteristicUUID: (0, incyclist_devices_1.parseUUID)(c.uuid),
                    properties: c.properties
                }));
                const body = { serviceUUID, characteristicDefinitions };
                const response = message.prepareResponse(request, incyclist_devices_1.DC_RC_REQUEST_COMPLETED_SUCCESSFULLY, body);
                const respBuffer = message.buildResponse(response);
                found = true;
                this.write(respBuffer);
            }
        });
        if (!found) {
            console.log('service not found', serviceUUID, this.services.map(s => (0, incyclist_devices_1.parseUUID)(s.uuid)).join(','));
            const body = { serviceUUID, characteristicDefinitions: [] };
            const response = message.prepareResponse(request, incyclist_devices_1.DC_RC_SERVICE_NOT_FOUND, body);
            const respBuffer = message.buildResponse(response);
            this.write(respBuffer);
        }
    }
    handleReadCharacteristic(buffer, message) {
        const request = message.parseRequest(buffer);
        console.log('ReadCharacteristic', request.body);
        const { characteristicUUID } = request.body;
        let found = false;
        this.services.forEach(s => {
            s.characteristics.forEach(char => {
                if ((0, incyclist_devices_1.parseUUID)(char.uuid) === (0, incyclist_devices_1.parseUUID)(characteristicUUID)) {
                    found = true;
                    const characteristicData = Buffer.from(char.value);
                    const body = { characteristicUUID, characteristicData };
                    const response = message.prepareResponse(request, incyclist_devices_1.DC_RC_REQUEST_COMPLETED_SUCCESSFULLY, body);
                    const respBuffer = message.buildResponse(response);
                    this.write(respBuffer);
                }
            });
        });
        if (!found) {
            const characteristicData = Buffer.from([]);
            const body = { characteristicUUID, characteristicData };
            const response = message.prepareResponse(request, incyclist_devices_1.DC_RC_CHARACTERISTIC_NOT_FOUND, body);
            const respBuffer = message.buildResponse(response);
            this.write(respBuffer);
        }
    }
    handleWriteCharacteristic(buffer, message) {
        const request = message.parseRequest(buffer);
        console.log('writeCharacteristic', request.body);
        const { characteristicUUID, characteristicData } = request.body;
        let found = false;
        this.services.forEach(s => {
            s.characteristics.forEach(char => {
                if ((0, incyclist_devices_1.parseUUID)(char.uuid) === (0, incyclist_devices_1.parseUUID)(characteristicUUID)) {
                    found = true;
                    char.write(Buffer.from(characteristicData), 0, false, (success, response) => {
                        console.log('writeCharacteristic', success, response);
                        const body = { characteristicUUID };
                        const resp = message.prepareResponse(request, incyclist_devices_1.DC_RC_REQUEST_COMPLETED_SUCCESSFULLY, body);
                        const respBuffer = message.buildResponse(resp);
                        this.write(respBuffer);
                        if (response) {
                            this.notify(characteristicUUID, response);
                        }
                    });
                }
            });
        });
        if (!found) {
            const body = { characteristicUUID };
            const response = message.prepareResponse(request, incyclist_devices_1.DC_RC_CHARACTERISTIC_NOT_FOUND, body);
            const respBuffer = message.buildResponse(response);
            this.write(respBuffer);
        }
    }
    enableCharacteristicNotifications(buffer, message) {
        const request = message.parseRequest(buffer);
        const { characteristicUUID, enable } = request.body;
        let found = false;
        this.services.forEach(s => {
            s.characteristics.forEach(char => {
                if ((0, incyclist_devices_1.parseUUID)(char.uuid) === (0, incyclist_devices_1.parseUUID)(characteristicUUID)) {
                    found = true;
                    if (enable) {
                        char.subscribe(characteristicData => {
                            this.notify(characteristicUUID, characteristicData);
                        });
                    }
                }
            });
        });
        const body = { characteristicUUID };
        const respCode = found ? incyclist_devices_1.DC_RC_REQUEST_COMPLETED_SUCCESSFULLY : incyclist_devices_1.DC_RC_CHARACTERISTIC_NOT_FOUND;
        const response = message.prepareResponse(request, respCode, body);
        const respBuffer = message.buildResponse(response);
        this.write(respBuffer);
    }
    notify(characteristicUUID, characteristicData) {
        const notifyMsg = new incyclist_devices_1.CharacteristicNotificationMessage();
        const body = notifyMsg.buildResponseBody({
            characteristicUUID, characteristicData
        });
        const seqNum = (this.lastMessageId + 1) % 256;
        this.lastMessageId = seqNum;
        const header = notifyMsg.buildHeader({
            msgVersion: 1,
            msgId: incyclist_devices_1.DC_MESSAGE_CHARACTERISTIC_NOTIFICATION,
            seqNum,
            respCode: incyclist_devices_1.DC_RC_REQUEST_COMPLETED_SUCCESSFULLY,
            length: body.length
        }, body.length);
        const response = Buffer.concat([header, body]);
        this.write(response);
    }
}
exports.DirectConnectComms = DirectConnectComms;
//# sourceMappingURL=comms.js.map