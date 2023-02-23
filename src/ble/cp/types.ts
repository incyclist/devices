
export type PowerData = {
    instantaneousPower?: number;
    balance?: number;
    accTorque?: number;
    time: number;
    rpm: number;
    raw?: string;
}

export type CrankData = {
    revolutions?: number,
    time?: number,
    cntUpdateMissing?: number,
}

