import { IService, ICharacteristic, TValue, IServiceDefinition } from "emulator/types";


export class Service implements IService {
    public uuid: string;
    public characteristics: ICharacteristic<TValue>[] = [];
    protected iv: NodeJS.Timeout;

    constructor(props: IServiceDefinition) {
        this.uuid = props.uuid;
        this.characteristics = props.characteristics;


    }

    notify(): void {
        this.characteristics.forEach(c => c.notify());
    }

    start(frequency: number): void {
        this.iv = setInterval(() => {

            this.notify();
        }, frequency);
    }

    stop() {
        if (this.iv) {
            clearInterval(this.iv);
            delete this.iv;
        }
    }

}
