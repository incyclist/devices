export * from './characteristics/characteristic.js'
export * from './types.js'


import { EventEmitter } from 'events';
import CyclingPowerService from './services/csp.js';
import { Service } from "./services/service.js";
import { FitnessMachineService } from './services/ftms.js';
import { HeartRateService } from './services/hrs.js';

const DEFAULT_FREQUENCY = 250;  // 250ms = 4Hz

interface Options {
  name?: string;
  frequency?: number;
  disableCps?: boolean;
}

interface DataUpdate  {
  power?: number;
  speed?: number;
  cadence?: number;
  heartrate?: number;
}

export class Emulator extends EventEmitter {
  name: string;
  csp: CyclingPowerService;
  ftms: FitnessMachineService;
  hrs: HeartRateService;
  last_timestamp: number;
  rev_count: number;

  power = 0;
  speed = 0;
  cadence = 0;
  heartrate = 0;
  frequency = DEFAULT_FREQUENCY;

  constructor(options: Options={}) {
    super();

    
    this.frequency = options.frequency || DEFAULT_FREQUENCY;
    this.name = options.name ?? "Emulator";


    this.hrs = new HeartRateService();
    this.csp = options.disableCps ? null : new CyclingPowerService();
    this.ftms = new FitnessMachineService();

    this.last_timestamp = 0;
    this.rev_count = 0;
  }

  getServices():Service[] {
    return [this.ftms, this.csp, this.hrs].filter(s => s !== null);
  }

  start() {
    this.last_timestamp = Date.now();
    this.getServices().forEach(s => s.start(this.frequency));
  }

  update(DataUpdate: DataUpdate) {
    const t = Date.now()-this.last_timestamp;

    const updateServices = () => {
        this.csp?.cyclingPowerMeasurement.update({
            watts: this.power,
            heartrate:this.heartrate,
            rev_count: this.rev_count
        })

        this.ftms.indoorBikeData.update({
            watts: this.power,
            cadence: this.cadence,
            heart_rate: this.heartrate
        })

        this.hrs.heartRateMeasurement.update({
            heart_rate: this.heartrate
        })

        
        
    }

    if ('cadence' in DataUpdate) this.cadence = DataUpdate.cadence;

    if (this.cadence>0)
        this.rev_count += Math.round(this.cadence/60*t/1000)

    if ('power' in DataUpdate) {
        this.power = DataUpdate.power;
    }
    if ('speed' in DataUpdate) 
        this.speed = DataUpdate.speed;

    if ('heartrate' in DataUpdate) {
        this.heartrate = DataUpdate.heartrate;        
    }

    updateServices()

  }

}

