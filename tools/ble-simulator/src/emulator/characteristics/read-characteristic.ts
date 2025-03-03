import { Characteristic } from "./characteristic";
import { TValue } from "../types";


export class StaticReadCharacteristic extends Characteristic<TValue> {

    public description: string
	constructor(uuid, description, value) {
		super({
			uuid: uuid,
			properties: ['read'],
			value: Buffer.isBuffer(value) ? value : Buffer.from(value),
			descriptors: [ {uuid: '2901',value: description}
			]
		});
		this.description = description;		
	}
}

