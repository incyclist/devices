import CyclingMode from '../../CyclingMode';
import DaumAdapter from '../DaumAdapter';
export default class DaumClassicAdapter extends DaumAdapter {
    static NAME: string;
    name: string;
    id: string;
    constructor(protocol: any, bike: any);
    setID(id: any): void;
    getID(): string;
    getName(): string;
    setName(name: any): void;
    getPort(): any;
    getSupportedCyclingModes(): Array<any>;
    getDefaultCyclingMode(): CyclingMode;
    check(): Promise<unknown>;
    start(props: any): Promise<unknown>;
    getCurrentBikeData(): any;
}
