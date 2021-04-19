import { DeviceProtocol } from './DeviceProtocol';
export default class DeviceRegistry {
    static _reset(): void;
    static _get(): any[];
    static register(protocol: DeviceProtocol): void;
    static findByName(name: string): DeviceProtocol;
    static findByInterface(interf: string): Array<DeviceProtocol>;
}
