import AntAdapter from '../AntAdapter';
export default class AntHrmAdapter extends AntAdapter {
    started: boolean;
    starting: boolean;
    constructor(DeviceID: any, port: any, stick: any, protocol: any);
    isBike(): boolean;
    isHrm(): boolean;
    isPower(): boolean;
    getProfile(): string;
    getName(): string;
    getDisplayName(): string;
    onDeviceData(deviceData: any): void;
    updateData(data: any, deviceData: any): any;
    start(props?: any): Promise<any>;
    stop(): Promise<boolean>;
}
