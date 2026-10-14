# FIXES_BACKLOG Item #109 - ANT+ Channel Slot Leak Fix

## Status: FIXED (in ant-plus repo)

This document tracks the fix for FIXES_BACKLOG item #109 — a channel slot leak in ANT+ device communication.

## Root Cause

The `incyclist-ant-plus` library's `Channel.stopAllSensors()` method had an early return on `!isSensor` that skipped channel cleanup whenever a sensor never successfully attached. This permanently leaked the channel slot (typically 1 of 8 in the fixed-size pool), turning any single "could not connect" failure into a compounding, eventually unrecoverable retry spiral.

## Fix Applied

**Location:** `incyclist-ant-plus` (ant-plus PR #190)

**Change:** Removed the `isSensor` guard in `Channel.stopAllSensors()` and instead guard only the `detach()` call on `this.attachedSensor` being set. This ensures `closeChannel()` and its resulting `freeChannel()` always execute, whether the sensor ever attached or not.

```typescript
// Before:
async stopAllSensors(): Promise<boolean> {
    if (!this.isSensor)
        return true;
    this.detach(this.attachedSensor)
    await this.closeChannel();
    this.isSensor = false;
}

// After:
async stopAllSensors(): Promise<boolean> {
    if (this.attachedSensor)
        this.detach(this.attachedSensor)
    await this.closeChannel();
    this.isSensor = false;
    return true;
}
```

## Testing

Comprehensive unit tests were added in `ant-plus/src/ant-channel.test.ts` covering:
- Channel is freed even when sensor attach fails (`isSensor` is false)
- Attached sensors are properly detached when stopping
- No detach attempt when no sensor is attached
- `isSensor` flag is always reset to false
- Method always returns true

All ant-plus tests pass (18 tests, 4 test suites).

## Impact on devices Repo

The `devices` repo doesn't require code changes — it consumes `incyclist-ant-plus` as a dependency. Once `ant-plus` is updated to include this fix, the behavior at the `AntInterface.startSensor()` level automatically improves: repeated failed start attempts will now properly reuse channel slots instead of permanently allocating new ones.

## Verification

Repeated failures to start a device (e.g., `could not connect` errors) will no longer cause the allocated ANT+ channel number to monotonically climb through the fixed-size pool (0→1→2→...→7→unrecoverable). Channels will be properly freed and reused.

## References

- FIXES_BACKLOG item #109 (full details)
- ant-plus PR #190 (implementation and unit tests)
