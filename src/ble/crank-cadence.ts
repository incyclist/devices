export type CrankSample = { revolutions: number, time: number }

// Derives cadence (RPM) from two samples of a BLE crank-revolution-count + crank-event-time
// (1/1024s units) pair, handling the 16-bit rollover of both counters - the same algorithm used
// by every sensor in this package that parses either the standard Cycling Power Measurement
// characteristic's crank-revolution fields (cp/wahoo/bkool), the CSC Measurement characteristic's
// crank-revolution fields (characteristics/csc/measurement.ts), or an equivalent crank-revolution
// page (tacx's own FE-C data).
//
// Two call sites (tacx, csc) seed their baseline from the very first real sample and report no
// cadence at all until a second sample arrives; the other three (cp, wahoo, bkool) compute from a
// synthetic zero baseline on the first call instead (a less accurate first reading, since the
// device's own counters are typically already non-zero by the time a client starts listening, but
// an existing, intentional difference - not something to unify away as a side effect of
// deduplicating the shared math). `seedOnFirstSample` preserves whichever behavior each caller
// already had.
export class CrankCadenceCalculator {

    protected prev: {revolutions:number, time:number, cntUpdateMissing:number} | undefined
    protected timeOffset = 0
    protected rpm: number | undefined

    constructor(protected seedOnFirstSample = false) {}

    update(sample: CrankSample): {rpm: number|undefined, time: number|undefined} {
        if (!this.prev) {
            if (this.seedOnFirstSample) {
                this.prev = {revolutions: sample.revolutions, time: sample.time, cntUpdateMissing: -1}
                return {rpm: undefined, time: undefined}
            }
            this.prev = {revolutions: 0, time: 0, cntUpdateMissing: -1}
        }

        const p = this.prev
        const hasUpdate = sample.time !== p.time

        if (hasUpdate) {
            let time = sample.time - p.time
            let revs = sample.revolutions - p.revolutions

            if (sample.time < p.time) {
                time += 0x10000
                this.timeOffset += 0x10000
            }
            if (sample.revolutions < p.revolutions)
                revs += 0x10000

            this.rpm = 1024*60*revs/time
        }
        else if (p.cntUpdateMissing<0 || p.cntUpdateMissing>2) {
            this.rpm = 0
        }

        this.prev = {
            revolutions: sample.revolutions,
            time: sample.time,
            cntUpdateMissing: hasUpdate ? 0 : p.cntUpdateMissing+1
        }

        return {rpm: this.rpm, time: this.timeOffset + sample.time}
    }

    reset(): void {
        this.prev = undefined
        this.timeOffset = 0
        this.rpm = undefined
    }
}
