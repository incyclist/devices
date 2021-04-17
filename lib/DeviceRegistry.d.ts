import DeviceProtocol from './DeviceProtocol';
export default class DeviceRegistry {
    static _reset(): void;
    static _get(): any[];
    static register(device: any): void;
    static findByName(name: any): DeviceProtocol;
    static findByInterface(interf: any): Array<DeviceProtocol>;
}
