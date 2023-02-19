import IncyclistDevice from "../src/base/adpater"

export default class MockAdapter extends IncyclistDevice {
    constructor() {
        super( {interface:'mock'} )
    }
    getProtocolName(): string {
        return ('mock')
    }
}
