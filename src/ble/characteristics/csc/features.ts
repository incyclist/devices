import { bit } from "../../utils"
import { CharacteristicParser } from "../types"


export type BleCSCFeatures = {
    wheelRevolutionData?: boolean,
    crankRevolutionData?: boolean,
    multipleSensorLocations?: boolean
}

export class CscFeatures implements CharacteristicParser<BleCSCFeatures> { 
    parse(buffer: Buffer): BleCSCFeatures {
        const data = Buffer.from(buffer)    

        const value = data.readUInt8(0)
        const bool = (bitNo) => (value & bit(bitNo)) > 0

        return {
            wheelRevolutionData: bool(0), 
            crankRevolutionData: bool(1),
            multipleSensorLocations: bool(2)
        }
    }

    reset() {
        // nothing to do
    }

}