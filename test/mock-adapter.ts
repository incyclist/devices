import { ControllableDeviceAdapter, CyclingMode, CyclingModeBase } from "../src"

export default class MockAdapter extends ControllableDeviceAdapter {
    constructor() {
        super( {interface:'mock'} )
    }
    getProtocolName(): string {
        return ('mock')
    }

    getDefaultCyclingMode():CyclingMode {
        return new CyclingModeBase(this)
    }
    getSupportedCyclingModes() : Array<any>  {
        return []
    }
}
