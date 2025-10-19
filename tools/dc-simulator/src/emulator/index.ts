export * from './characteristics/characteristic.js'
export * from './types.js'


import { EventEmitter } from 'events';
import CyclingPowerService from './services/csp.js';
import { Service } from "./services/service.js";
import { FitnessMachineService } from './services/ftms.js';
import { HeartRateService } from './services/hrs.js';
import { ZwiftPlayService } from './services/zwift-play.js';

const DEFAULT_FREQUENCY = 250;  // 250ms = 4Hz

export interface EmulatorOptions {
  name?: string;
  frequency?: number;
  uuids?: string[]
  power?: number
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
  play: ZwiftPlayService
  hrs: HeartRateService;
  last_timestamp: number;
  rev_count: number;
  paused: boolean;

  targetPower: number
  protected playActive: boolean

  public power = 0;
  public speed = 0;
  public cadence = 0;
  public heartrate = 0;
  frequency = DEFAULT_FREQUENCY;

  mode: 'ERG' | 'SIM'

  constructor(options: EmulatorOptions={}) {
    super();

    const {frequency=DEFAULT_FREQUENCY, uuids=[],power} = options??{}
    
    this.frequency = frequency
    this.targetPower = power
    this.name = options.name ?? "Emulator";


    this.hrs = uuids.includes('180D') ? new HeartRateService() : null;
    this.csp = uuids.includes('1818') ? new CyclingPowerService() : null;
    this.ftms = uuids.includes('1826') ? new FitnessMachineService() : null;
    this.play = uuids.includes('00000001-19CA-4651-86E5-FA29DCDD09D1') ? new ZwiftPlayService() : null

    this.last_timestamp = 0;
    this.rev_count = 0;
    this.mode = 'SIM'
    this.playActive = false
  }

  setName(name:string) {
    this.name = name
  }


  getServices():Service[] {
    const services = [this.ftms, this.csp, this.hrs, this.play].filter(s => s !== null);
    console.log('Emulator services',services)
    return services
  }

  start() {
    this.last_timestamp = Date.now();
    this.getServices().forEach(s =>  {
      s.setEmulator(this)
      s.start(this.frequency) 
    });
  }

  setMode(mode: 'ERG' | 'SIM', power?) {
    
    this.mode = mode
    if (power && mode === 'ERG' && !this.paused) 
        this.power = power    
  }

  pause() {
    this.cadence = 0
    this.power = 0
    this.speed = 0
    this.paused = true

    this.updateServices()

  }

  resume() {
    this.paused = false
    this.cadence = 90
    this.power = 100
    this.speed = 20
    this.updateServices()
  }

  update(DataUpdate: DataUpdate) {
    const t = Date.now()-this.last_timestamp;


    if ('cadence' in DataUpdate) this.cadence = DataUpdate.cadence;

    if (this.cadence>0)
        this.rev_count += Math.round(this.cadence/60*t/1000)

    if ('power' in DataUpdate && this.mode!=='ERG') {
        this.power = this.targetPower??DataUpdate.power;
    }
    if ('speed' in DataUpdate) 
        this.speed = DataUpdate.speed;

    if ('heartrate' in DataUpdate) {
        this.heartrate = DataUpdate.heartrate;        
    }

    this.updateServices()

  }

  updateServices()  {
    this.csp?.cyclingPowerMeasurement.update({
        watts: this.power,
        heartrate:this.heartrate,
        rev_count: this.rev_count
    })

    this.ftms?.indoorBikeData.update({
        watts: this.power,
        cadence: this.cadence,
        heart_rate: this.heartrate
    })

    this.hrs?.heartRateMeasurement.update({
        heart_rate: this.heartrate
    })

    if (this.playActive) {
      this.play?.measurement.update( {
          cadence: this.cadence,
          power: this.power,
          speed: this.speed,
          heartrate: this.heartrate
      })
    }


    
    
  }

  async rideOn() {
    console.log('# processing ride on')
   
    //this.play.measurement.send(Buffer.from('2a08031211220f4154582030312c2053545820303100','hex'))
    this.play.measurement.send(Buffer.from('2a0803120d220b524944455f4f4e28312900','hex'))

    this.play.response.send(Buffer.from('526964654f6e0202','hex'))
    setTimeout( ()=>{
      this.playActive = true
    }, 500)
    
  
  }



}

