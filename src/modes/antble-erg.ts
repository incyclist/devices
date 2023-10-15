import ICyclingMode, {  CyclingModeProperyType, UpdateRequest } from "./types";
import PowerBasedCyclingModeBase from "./power-base";
import { IncyclistDeviceAdapter } from "../base/adpater";


export default class ERGCyclingMode extends PowerBasedCyclingModeBase implements ICyclingMode {

    protected static config = {
        isERG:true,
        name: "ERG",
        description: "Calculates speed based on power and slope. Power targets are set by workout or remain stable throughout the workout",
        properties: [
            {key:'bikeType',name: 'Bike Type', description: '', type: CyclingModeProperyType.SingleSelect, options:['Race','Mountain','Triathlon'], default: 'Race'},
            {key:'startPower',name: 'Starting Power', description: 'Initial power in Watts at start of training', type: CyclingModeProperyType.Integer, default: 50, min:25, max:800},
    
        ]
    }

    constructor(adapter: IncyclistDeviceAdapter, props?:any) {
        super(adapter,props);
        this.initLogger('ERGMode')
    }

    getBikeInitRequest(): UpdateRequest {
        const startPower = Number(this.getSetting('startPower'))
        this.prevRequest = { targetPower: startPower}
        return { targetPower: startPower};
    }    


}