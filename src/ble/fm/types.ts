
export type IndoorBikeData = {
    speed?: number;
    averageSpeed?: number;
    cadence?: number;
    averageCadence?: number;
    totalDistance?: number;
    resistanceLevel?: number;
    instantaneousPower?: number;
    averagePower?: number;

    totalEnergy?: number;
    energyPerHour?: number;
    energyPerMinute?: number;
    heartrate?: number;
    metabolicEquivalent?: number;
    time?: number;
    remainingTime?: number;
    raw?: string;

    targetPower?: number;
    targetInclination?: number;
    status?: string;
}

export type IndoorBikeFeatures = {
    fitnessMachine: number;
    targetSettings: number;
    power?: boolean;
    heartrate?: boolean;
    cadence?: boolean;
    setSlope?: boolean;
    setPower?: boolean;
    setResistance?: boolean;
    fmInfo?: string[],
    tsInfo?: string[]
}


