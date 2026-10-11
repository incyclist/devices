// Shared ANT+ FE-C data page builders - the same page formats defined by the real ANT+ FE-C
// profile, reused by every sensor in this package that speaks this page vocabulary over BLE in
// its own way: Tacx (ble/tacx/sensor.ts) tunnels a full ANT+ message (sync/channel/checksum)
// over its own RX/TX characteristics; Bkool (ble/bkool/sensor.ts) writes the bare 8-byte page
// directly, with its own device-specific marker byte where the spec says "reserved". These
// builders return just the page itself (page ID + 7 data/reserved bytes) - each caller wraps it
// in whatever envelope its own protocol needs via its own `reservedByte1`.
//
// Numeric fields follow the ANT+ FE-C convention: `undefined` means "field not used", encoded as
// 0xFF (8-bit fields) or 0xFFFF (16-bit fields) - what a caller's own *missing* argument should
// default to instead (e.g. Tacx's sendBasicResistance treats an omitted resistance as 0%, not
// "not used") is that caller's decision, made before calling - these functions never guess at it.

export enum FECPage {
    basicResistance = 0x30,
    targetPower = 0x31,
    windResistance = 0x32,
    trackResistance = 0x33,
    userConfiguration = 0x37
}

const RESERVED = 0xFF

export function buildBasicResistancePage(resistancePercent: number|undefined, reservedByte1 = RESERVED): number[] {
    const res = resistancePercent===undefined ? RESERVED : Math.trunc(resistancePercent/0.5) & 0xFF
    return [FECPage.basicResistance, reservedByte1, RESERVED, RESERVED, RESERVED, RESERVED, RESERVED, res]
}

export function buildTargetPowerPage(powerWatts: number|undefined, reservedByte1 = RESERVED): number[] {
    const p = powerWatts===undefined ? 0xFFFF : Math.trunc(powerWatts*4) & 0xFFFF
    return [FECPage.targetPower, reservedByte1, RESERVED, RESERVED, RESERVED, RESERVED, p&0xFF, (p>>8)&0xFF]
}

export function buildWindResistancePage(windCoeff: number|undefined, windSpeed: number|undefined, draftFactor: number|undefined, reservedByte1 = RESERVED): number[] {
    const wc = windCoeff===undefined ? RESERVED : Math.trunc(windCoeff/0.01) & 0xFF
    const ws = windSpeed===undefined ? RESERVED : Math.trunc(windSpeed+127) & 0xFF
    const df = draftFactor===undefined ? RESERVED : Math.trunc(draftFactor/0.01) & 0xFF
    return [FECPage.windResistance, reservedByte1, RESERVED, RESERVED, RESERVED, wc, ws, df]
}

export function buildTrackResistancePage(slopePercent: number|undefined, rrCoeff: number|undefined, reservedByte1 = RESERVED): number[] {
    const s = slopePercent===undefined ? 0xFFFF : Math.trunc((slopePercent+200)/0.01) & 0xFFFF
    const rr = rrCoeff===undefined ? RESERVED : Math.trunc(rrCoeff/0.00005) & 0xFF
    return [FECPage.trackResistance, reservedByte1, RESERVED, RESERVED, RESERVED, s&0xFF, (s>>8)&0xFF, rr]
}

export function buildUserConfigurationPage(userWeightKg: number|undefined, bikeWeightKg: number|undefined, wheelDiameterM: number|undefined, gearRatio: number|undefined): number[] {
    let m = userWeightKg===undefined ? 0xFFFF : Math.trunc(userWeightKg*100)
    let mb = bikeWeightKg===undefined ? 0xFFF : Math.trunc(bikeWeightKg*20)
    let d: number = wheelDiameterM ?? RESERVED
    const gr = gearRatio===undefined ? 0x00 : Math.trunc(gearRatio/0.03)
    let dOffset = RESERVED

    if (d!==RESERVED) {
        d = d*1000
        dOffset = d%10
        d = Math.trunc(d/10)
    }

    return [
        FECPage.userConfiguration,
        m&0xFF, (m>>8)&0xFF,
        RESERVED,
        ((mb&0xF)<<4)|(dOffset&0xF), (mb>>4)&0xF,
        d&0xFF,
        gr&0xFF
    ]
}
