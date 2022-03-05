import DaumAdapter from '../DaumAdapter';
export default class DaumPremiumDevice extends DaumAdapter {
    static NAME: string;
    constructor(protocol: any, bike: any);
    getName(): string;
    getPort(): any;
    getInterface(): any;
    getSupportedCyclingModes(): Array<any>;
    check(): Promise<unknown>;
    start(props: any): Promise<unknown>;
    getCurrentBikeData(): Promise<any>;
}
