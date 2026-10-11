// Bkool SmartPro/Pro2/Pro3 family (OEM BLE module shared with Zycle, which already works via
// generic FTMS). UUIDs confirmed against real devices via users' own "BLEServer characteristics:"
// GATT-discovery telemetry, independently of qdomyos-zwift's bkoolbike.cpp (which targets the same
// UUIDs, but was initially found to target f03ee002 as a *service* - a bug in its own matching
// logic, not evidence of a different UUID). See design repo features/bkool-smartpro-trainer-support.
export const BKOOL_SERVICE = 'f03eee01-4910-473c-be46-960948c2f59c'
export const BKOOL_CONTROL = 'f03ee002-4910-473c-be46-960948c2f59c'  // writeWithoutResponse + notify

// Real devices only ever advertise standard CP (1818) + Device Information (180a) during scanning
// - the proprietary service above is never in the advertisement, only discoverable post-connect.
// So, unlike every other BLE adapter in this package, protocol detection for this device cannot be
// service-UUID-driven at scan time; it has to go by the advertised device name instead - exactly
// how qdomyos-zwift itself dispatches to bkoolbike.cpp (name-prefix match, not UUID-based). Confirmed
// real names: BkoolSmartPro, BkoolSmartPro2, BkoolSmartPro3. Deliberately excludes BkoolSmartGo/Go2
// (no GATT reference implementation exists for that sub-family, per the architecture doc) and
// BkoolFBike/BkoolFitnessBike (a different QZ class, not covered by this adapter).
export const BKOOL_NAME_PREFIX = 'BKOOLSMARTPRO'

export function isBkoolDeviceName(name?: string): boolean {
    return !!name && name.toUpperCase().startsWith(BKOOL_NAME_PREFIX)
}

// Bare 8-byte ANT+ FE-C data pages - no sync/channel/checksum envelope (unlike Tacx, which tunnels
// full ANT+ messages). Field layouts are the standard ANT+ FE-C pages - same vocabulary already
// implemented for Tacx (sendBasicResistance/sendTargetPower/sendWindResistance/sendTrackResistance/
// sendUserConfiguration in ../tacx/sensor.ts) - just without the leading ANT channel byte.
export enum FECPage {
    basicResistance = 0x30,
    targetPower = 0x31,
    windResistance = 0x32,
    trackResistance = 0x33,
    userConfiguration = 0x37
}

// Byte 1 of every basicResistance/targetPower/windResistance/trackResistance frame is fixed at
// this value in all observed traffic - both qdomyos-zwift's own hardcoded writes and its init
// sequence captured live against a simulator. Real ANT+ FE-C reserves this byte (0xFF); this
// device's BLE variant repurposes it for something unidentified, consistently, across every page
// in this family except userConfiguration (which puts real payload there instead - see
// sendUserConfiguration). Treated as an opaque, required marker rather than guessed at further.
export const BKOOL_FRAME_MARKER = 0x25
