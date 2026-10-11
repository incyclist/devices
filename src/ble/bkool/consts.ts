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
// full ANT+ messages). Byte layouts below are confirmed byte-for-byte against bkoolbike.cpp
// (forcePower()/forceInclination()/the fixed init sequence) and, for the init sequence, against a
// live capture of qdomyos-zwift's actual writes to a simulated device.
export enum FECPage {
    basicResistance = 0x30,
    targetPower = 0x31,
    windResistance = 0x32,
    trackResistance = 0x33,
    userConfiguration = 0x37
}

// Fixed frames bkoolbike.cpp sends once on first connect, before any dynamic power/slope write -
// confirmed byte-for-byte via live QZ capture. Real purpose of the exact byte values (beyond the
// page ID) is unconfirmed; they are treated as an opaque, required handshake.
export const INIT_BASIC_RESISTANCE = [0x30, 0x25, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00]
export const INIT_WIND_RESISTANCE  = [0x32, 0x25, 0xff, 0xff, 0xff, 0x1e, 0x7f, 0x00]
export const INIT_TRACK_RESISTANCE = [0x33, 0x25, 0xff, 0xff, 0xff, 0x20, 0x4e, 0x00]
export const INIT_USER_CONFIG_1    = [0x37, 0x4c, 0x1d, 0xff, 0x80, 0x0c, 0x46, 0x21]
export const INIT_USER_CONFIG_2    = [0x37, 0xee, 0x16, 0xff, 0x80, 0x0c, 0x46, 0x21]  // BKOOLSMARTPRO branch (not bkool_fitness_bike)
