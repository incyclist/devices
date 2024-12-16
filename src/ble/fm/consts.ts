export const cwABike = {
    race: 0.35,
    triathlon:0.29,
    mountain: 0.57
}
export const cRR = 0.0036;					// http://www.radpanther.de/index.php?id=85  -- Conti GP 4000 RS
export const enum OpCode {
    RequestControl = 0x00,
    Reset = 0x01,
    SetTargetSpeed = 0x02,
    SetTargetInclination = 0x03,
    SetTargetResistance = 0x04,
    SetTargetPower = 0x05,
    SetTargetHeartRate = 0x06,
    StartOrResume = 0x07,
    StopOrPause = 0x08,
    //SetTargetedExpendedEnergy = 0x09,
    //SetTargetedNumberofSteps = 0x0A,
    SetIndoorBikeSimulation = 0x11,
    SetWheelCircumference = 0x12,
    SpinDownControl = 0x13,
    SetTargetedCadence = 0x14,
    ResponseCode = 0x80
}
export const enum FitnessMachineStatusOpCode {
    Reset = 0x01,
    FitnessMachineStoppedOrPaused = 0x02,
    FitnessMachineStoppedBySafetyKey = 0x03,
    FitnessMachineStartedOrResumed = 0x04,
    TargetSpeedChanged = 0x05,
    TargetInclineChanged = 0x06,
    TargetResistanceLevelChanged = 0x07,
    TargetPowerChanged = 0x08,
    TargetHeartRateChanged = 0x09,
    TargetExpendedEnergyChanged = 0x0A,
    // ignore 0x0B...0x11
    IndoorBikeSimulationParametersChanged = 0x12,
    WheelCircumferenceChanged = 0x13,
    SpinDownStatus = 0x14,
    TargetedCadenceChanged = 0x15,
    ControlPermissionLost = 0xFF
}
export const enum OpCodeResut {
    Success = 0x01,
    OpCodeNotSupported = 0x02,
    InvalidParameter = 0x03,
    OperationFailed = 0x04,
    ControlNotPermitted = 0x05
}
const bit = (nr) => (1 << nr);
export const IndoorBikeDataFlag = {
    MoreData: bit(0), // 0x01
    AverageSpeedPresent: bit(1), // 0x02
    InstantaneousCadence: bit(2), // 0x04
    AverageCadencePresent: bit(3), // 0x08
    TotalDistancePresent: bit(4), // 0x10
    ResistanceLevelPresent: bit(5), // 0x20
    InstantaneousPowerPresent: bit(6), // 0x40
    AveragePowerPresent: bit(7), // 0x80
    ExpendedEnergyPresent: bit(8), // 0x100
    HeartRatePresent: bit(9), // 0x200
    MetabolicEquivalentPresent: bit(10), // 0x400
    ElapsedTimePresent: bit(11), // 0x800
    RemainingTimePresent: bit(12) // 0x1000
};
export const FitnessMachineFeatureFlag = {
    AverageSpeedSupported: bit(0), // 0x0001
    CadenceSupported: bit(1), // 0x0002
    TotalDistanceSupported: bit(2), // 0x0004
    InclinationSupported: bit(3), // 0x0008
    ElevationGainSupported: bit(4), // 0x0010
    PaceSupported: bit(5), // 0x0020
    StepCountSupported: bit(6), // 0x0040
    ResistanceLevelSupported: bit(7), // 0x0080
    StrideCountSupported: bit(8), // 0x0100
    ExpendedEnergySupported: bit(9), // 0x0200
    HeartRateMeasurementSupported: bit(10), // 0x0400
    MetabolicEquivalentSupported: bit(11), // 0x0800
    ElapsedTimeSupported: bit(12), // 0x1000
    RemainingTimeSupported: bit(13), // 0x2000
    PowerMeasurementSupported: bit(14), // 0x4000
    ForceOnBeltAndPowerOutputSupported: bit(15), // 0x8000
    UserDataRetentionSupported: bit(16)
};
export const TargetSettingFeatureFlag = {
    SpeedTargetSettingSupported: bit(0),
    InclinationTargetSettingSupported: bit(1),
    ResistanceTargetSettingSupported: bit(2),
    PowerTargetSettingSupported: bit(3),
    HeartRateTargetSettingSupported: bit(4),
    TargetedExpendedEnergyConfigurationSupported: bit(5),
    TargetedStepNumberConfigurationSupported: bit(6),
    TargetedStrideNumberConfigurationSupported: bit(7),
    TargetedDistanceConfigurationSupported: bit(8),
    TargetedTrainingTimeConfigurationSupported: bit(9),
    TargetedTimeInTwoHeartRateZonesConfigurationSupported: bit(10),
    TargetedTimeInThreeHeartRateZonesConfigurationSupported: bit(11),
    TargetedTimeInFiveHeartRateZonesConfigurationSupported: bit(12),
    IndoorBikeSimulationParametersSupported: bit(13),
    WheelCircumferenceConfigurationSupported: bit(14),
    SpinDownControlSupported: bit(15),
    TargetedCadenceConfigurationSupported: bit(16)
};
