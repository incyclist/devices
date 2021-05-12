import { EventLogger } from 'gd-eventlog';
export default class IndoorBikeProcessor {
    bike: any;
    prevTS: any;
    prevDistance: any;
    prevRpm: any;
    prevSpeed: any;
    prevGear: any;
    prevPower: any;
    prevSlope: any;
    prevSettings: any;
    lastUpdate: any;
    hasBikeUpdate: boolean;
    logger: EventLogger;
    constructor(bike: any, opts?: any);
    reset(): void;
    setValues(data: any): any;
    isAccelMode(): any;
    getSlope(data: any): any;
    getBikeType(props: any): any;
    getWeight(props: any): any;
    getValues(data: any, props?: {}): any;
    caclulateTargetPower(data: any, updateMode?: boolean): any;
}
