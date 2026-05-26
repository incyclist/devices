export interface ISpeedSensor {
    setWheelCircumference(wheelCircumference: number):Promise<void>
    getWheelCircumference(): number
}