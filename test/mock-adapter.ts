import IncyclistDevice, { ControllableDevice } from "../src/base/adpater"
import { CyclingMode } from "../src/modes/types"
import { DeviceProperties } from "../src/types/device"

export const MockConfig = {
    name: 'PowerMeter',
    description: 'Power and cadence are taken from device. Speed is calculated from power and current slope\nThis mode will not respect maximum power and/or workout limits',
    properties: []
}


export default class MockAdapter extends IncyclistDevice<ControllableDevice<DeviceProperties>,DeviceProperties> {
    constructor() {
        super( {interface:'mock'} )
        
    }
    getProtocolName(): string {
        return ('mock')
    }

    getDefaultCyclingMode():CyclingMode {
        return new CyclingMode(this)
    }
    getSupportedCyclingModes() : Array<any>  {
        return []
    }
}
