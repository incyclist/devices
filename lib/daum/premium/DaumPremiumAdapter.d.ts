import DaumAdapter from '../DaumAdapter';
export default class DaumPremiumDevice extends DaumAdapter {
    static NAME: string;
    constructor(protocol: any, bike: any);
    getName(): string;
    getPort(): any;
    getInterface(): any;
    check(): Promise<unknown>;
    start(props: any): Promise<unknown>;
    getCurrentBikeData(): any;
    updateData(data: any, bikeData: any): any;
}
