import { Characteristic } from "./characteristic.js";
import { TValue } from "../types.js";

// Proprietary control characteristic - CONFIRMED present on real Bkool SmartPro/SmartPro3
// hardware via ES ("BLEServer characteristics:" events from real users' own connection
// attempts): service f03eee01 contains characteristic f03ee002 (writeWithoutResponse,notify)
// plus f03ee004 and f03ee006 (notify only, not yet implemented here). This is also exactly
// the UUID qdomyos-zwift's bkoolbike.cpp targets for its FE-C writes - its "no
// gattCustomService" failure against this simulator turned out to be QZ checking the wrong
// GATT level (it matches on *service* UUID == f03ee002, but on real hardware f03ee002 is a
// *characteristic* under service f03eee01, not a service itself). The byte-level FE-C-page
// format below is still only as confirmed as QZ's own source, but the characteristic UUID
// and bidirectional (write+notify) shape are now independently confirmed against real
// devices, not just inferred from QZ. See design repo features/bkool-smartpro-trainer-support.
// Hypothesis, derived from qdomyos-zwift's bkoolbike.cpp, NOT yet confirmed against real
// hardware: this characteristic carries bare ANT+ FE-C data pages - no ANT sync/channel/
// checksum envelope, just the 8-byte page straight as the GATT write value.
//   page 0x30 - Basic Resistance
//   page 0x31 - Target Power   (quarter-watt units, bytes[6..7] LE)
//   page 0x33 - Track Resistance / slope (bytes[5..6] LE, raw = (slope + 200) * 100)
//   page 0x37 - User Configuration
const FEC_PAGE_BASIC_RESISTANCE = 0x30;
const FEC_PAGE_TARGET_POWER = 0x31;
const FEC_PAGE_TRACK_RESISTANCE = 0x33;
const FEC_PAGE_USER_CONFIGURATION = 0x37;

export interface BkoolControlState extends TValue {
    targetPower?: number     // W
    targetSlope?: number     // %
    basicResistance?: number // raw FE-C page 0x30 byte
}

export class BkoolControlCharacteristic extends Characteristic<BkoolControlState> {

    public state: BkoolControlState = {}

    constructor() {
        super({
            uuid: 'F03EE002-4910-473C-BE46-960948C2F59C',
            value: null,
            properties: ['write', 'notify'],
            descriptors: [
                { uuid: '2901', value: 'Bkool Control Point' },
                { uuid: '2902', value: Buffer.alloc(2) },
            ]
        });
        this.description = 'Bkool Control Point';
    }

    // Probe: QZ subscribes to THIS characteristic for notifications and never touches the
    // standard Cycling Power Measurement (2A63) - contradicts the write-only-control
    // assumption in the header comment above. Pushing telemetry here too, reusing the same
    // byte layout as CyclingPowerMeasurementCharacteristic for now, purely to test empirically
    // whether QZ reads telemetry from this characteristic at all before investing in getting
    // the exact real encoding right.
    pushTelemetry(buffer: Buffer): void {
        this.value = buffer
        this.notify()
    }

    write(data: Buffer, _offset: number, _withoutResponse: boolean, callback: (success: boolean) => void): void {
        console.log(`[CONTROL WRITE] raw=${data.toString('hex')} -> ${this.decode(data)}`)

        const page = data.length > 0 ? data.readUInt8(0) : undefined

        if (page === FEC_PAGE_TARGET_POWER && data.length >= 8) {
            const quarterWatts = data.readUInt16LE(6)
            this.state.targetPower = quarterWatts / 4
        }
        else if (page === FEC_PAGE_TRACK_RESISTANCE && data.length >= 7) {
            const raw = data.readUInt16LE(5)
            this.state.targetSlope = raw / 100 - 200
        }
        else if (page === FEC_PAGE_BASIC_RESISTANCE && data.length >= 8) {
            this.state.basicResistance = data.readUInt8(7)
        }

        // echo the write back as a notification - cheap to support in case a client expects
        // an ack/response frame here; remove if it turns out to confuse a real client
        this.value = data
        this.notify()

        callback(true)
    }

    private decode(data: Buffer): string {
        if (data.length < 2) return `too short to be a FE-C page: ${data.toString('hex')}`
        const page = data.readUInt8(0)
        switch (page) {
            case FEC_PAGE_TARGET_POWER:
                return data.length >= 8 ? `page 0x31 Target Power: ${(data.readUInt16LE(6) / 4).toFixed(2)} W` : 'page 0x31 (too short)'
            case FEC_PAGE_TRACK_RESISTANCE:
                return data.length >= 7 ? `page 0x33 Track Resistance: slope ${(data.readUInt16LE(5) / 100 - 200).toFixed(2)}%` : 'page 0x33 (too short)'
            case FEC_PAGE_BASIC_RESISTANCE:
                return `page 0x30 Basic Resistance: raw=${data.toString('hex')}`
            case FEC_PAGE_USER_CONFIGURATION:
                return `page 0x37 User Configuration: raw=${data.toString('hex')}`
            default:
                return `unrecognized page 0x${page.toString(16)}: raw=${data.toString('hex')}`
        }
    }
}
