import { IService, ICharacteristic, TValue, IServiceDefinition } from "emulator/types";
export declare class Service implements IService {
    uuid: string;
    characteristics: ICharacteristic<TValue>[];
    protected iv: NodeJS.Timeout;
    constructor(props: IServiceDefinition);
    notify(): void;
    start(frequency: number): void;
    stop(): void;
}
