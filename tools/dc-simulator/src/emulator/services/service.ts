import { IService, ICharacteristic, TValue, IServiceDefinition, IEmulator } from "emulator/types";


export class Service implements IService {
    public uuid: string;
    public characteristics: ICharacteristic<TValue>[] = [];
    protected iv: NodeJS.Timeout;
    protected emulator: IEmulator    

    constructor(props: IServiceDefinition) {
        this.uuid = props.uuid;
        this.characteristics = props.characteristics;
    }

    setEmulator(emulator: IEmulator) {
        this.emulator = emulator
        this.characteristics.forEach(c => c.setEmulator(emulator))
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
