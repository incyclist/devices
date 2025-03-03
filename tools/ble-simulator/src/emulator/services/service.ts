import bleno from "@stoprocent/bleno";
import { Characteristic } from "emulator/characteristics/characteristic";
import { IService,  TValue, IServiceDefinition, ICharacteristic } from "emulator/types";


export class Service extends bleno.PrimaryService implements IService {
    protected _characteristics: ICharacteristic<TValue>[] = [];

    protected iv: NodeJS.Timeout;

    constructor(props: IServiceDefinition) {

        const characteristics = props.characteristics as unknown as  Characteristic<TValue>[]

        super( {
            uuid: props.uuid,
            characteristics: characteristics.map( c => c.bleno)
        })

        this._characteristics = props.characteristics;
    }

    notify(): void {
        this._characteristics.forEach(c => c.notify());
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
