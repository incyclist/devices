import {CSC, CSC_MEASUREMENT,CSC_FEATURE}  from '../consts'
import { beautifyUUID} from '../utils';
import { LegacyProfile } from '../../antv2/types';
import { BleProtocol } from '../types';
import { TBleSensor } from '../base/sensor';
import { CharacteristicParser } from '../characteristics/types';
import { CscMeasurement, CyclingCadenceAndSpeed } from '../characteristics/csc/measurement';
import { BleCSCFeatures, CscFeatures } from '../characteristics/csc/features';


export class BleCyclingSpeedCadenceDevice extends TBleSensor {
    static readonly profile: LegacyProfile = 'Speed + Cadence Sensor'
    static readonly protocol:BleProtocol = 'csc'
    static readonly services =  [CSC];
    static readonly characteristics =  [ CSC_MEASUREMENT, CSC_FEATURE];
    static readonly detectionPriority = 1;
    
    protected data : CyclingCadenceAndSpeed
    protected parsers: Record<string, CharacteristicParser<any>> = {}
    protected featureParser: CscFeatures

    constructor (peripheral, props?) {
        super(peripheral,props)
        this.data = {}

        const measurement = new CscMeasurement()
        this.featureParser = new CscFeatures()
        this.parsers[ beautifyUUID(CSC_MEASUREMENT)] = measurement 
    }
   

    protected getRequiredCharacteristics():Array<string> {
        return [CSC_MEASUREMENT]
    }

    async getFeatures():Promise<BleCSCFeatures> {
        try {
            const data = await this.read(CSC_FEATURE)
            const features = this.featureParser.parse(data)
            this.logEvent({message:'supported features',features, raw:data?.toString('hex')})
            return features

        }
        catch( err) {
            this.logEvent({message:'read failed',characteristic: CSC_FEATURE, reason:err.message})
        }
    }

    onData(characteristic:string,characteristicData: Buffer):boolean {       
        const data = Buffer.from(characteristicData);
        const hasData = super.onData(characteristic,data);
        if (!hasData) 
            return false;

        const uuid = beautifyUUID( characteristic)
        const parser = this.parsers[uuid]
        if (!parser) {
            return false;
        }

        const parsed =  parser.parse(data)
        this.data = {...this.data,...parsed}

        this.emit('data', this.data)
        return true;
  
    }

    reset() {
        this.data = {}
    }

}

