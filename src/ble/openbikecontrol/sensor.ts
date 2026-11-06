import { LegacyProfile } from "../../antv2/types.js";
import { TBleSensor } from "../base/sensor.js";
import { BleProtocol } from "../types.js";
import { matches } from "../utils.js";

// OpenBikeControl (https://openbikecontrol.org) - open protocol for handlebar controllers
const OBC_SERVICE = 'd273f680-d548-419d-b9d1-fa0472345229'
const OBC_BUTTON_STATE = 'd273f681-d548-419d-b9d1-fa0472345229'
const OBC_APP_INFO = 'd273f683-d548-419d-b9d1-fa0472345229'

const MSG_BUTTON_STATE = 0x01
const MSG_APP_INFO = 0x04

const BUTTON_SHIFT_UP = 0x01
const BUTTON_SHIFT_DOWN = 0x02
const BUTTON_INCREASE_DIFFICULTY = 0x30
const BUTTON_DECREASE_DIFFICULTY = 0x31
const BUTTON_SKIP_INTERVAL = 0x32
const BUTTON_PREVIOUS_INTERVAL = 0x36

// OpenBikeControl button IDs mapped to the keys that are already used for the Zwift controllers
const BUTTON_KEYS = new Map<number,string>([
    [BUTTON_SHIFT_UP, 'r-shift-up'],
    [BUTTON_SHIFT_DOWN, 'r-shift-down'],
    [BUTTON_INCREASE_DIFFICULTY, 'y'],
    [BUTTON_DECREASE_DIFFICULTY, 'b'],
    [BUTTON_SKIP_INTERVAL, 'a'],
    [BUTTON_PREVIOUS_INTERVAL, 'z'],
])

type ButtonState = {
    pressed: boolean
    timestamp: number
}

export class BleOpenBikeControlSensor extends TBleSensor {
    static readonly profile:LegacyProfile  = 'Controller'
    static readonly protocol:BleProtocol = 'openbikecontrol'
    static readonly services =  [OBC_SERVICE];
    static readonly characteristics =  [];
    static readonly detectionPriority = 0;     // trainers that also offer OpenBikeControl should be detected as trainer

    protected buttonStates: Map<number, ButtonState> = new Map()

    protected onDisconnect() {
        super.onDisconnect()
        this.reset()
    }

    async subscribe():Promise<boolean> {
        const subscribed = await super.subscribe()
        if (subscribed)
            await this.sendAppInfo()
        return subscribed
    }

    protected getRequiredCharacteristics():Array<string> {
        return [OBC_BUTTON_STATE]
    }

    onData(characteristic: string, data: Buffer): boolean {
        if (matches(characteristic,OBC_BUTTON_STATE)) {
            this.onButtonState(Buffer.from(data))
        }
        return true
    }

    protected onButtonState(data:Buffer) {
        try {
            if (data.length<3 || data[0]!==MSG_BUTTON_STATE)
                return

            // keys are reported on release, same as for the Zwift controllers
            const released = new Map<number,number>()
            for (let i=1; i+1<data.length; i+=2) {
                const buttonId = data[i]
                if (!BUTTON_KEYS.has(buttonId))
                    continue

                const pressed = data[i+1]!==0x00
                const prev = this.buttonStates.get(buttonId)
                if (pressed && !prev?.pressed) {
                    this.buttonStates.set(buttonId, {pressed:true, timestamp:Date.now()})
                }
                else if (!pressed && prev?.pressed) {
                    released.set(buttonId, Date.now()-prev.timestamp)
                    this.buttonStates.set(buttonId, {pressed:false, timestamp:Date.now()})
                }
            }

            this.getReleasedKeys(released).forEach( ({key,duration}) => {
                const {name,address} = this.peripheral?.getInfo() ?? {}
                this.logEvent({message:'key pressed', key, name,address, duration})
                this.emit('key-pressed', {key, duration})
            })
        }
        catch(err) {
            this.logEvent({message:'error', fn:'onButtonState', error:err.message, stack:err.stack})
        }
    }

    protected getReleasedKeys(released:Map<number,number>):Array<{key:string, duration:number}> {
        const keys:Array<{key:string, duration:number}> = []

        // controllers may send shift and difficulty for the same physical button (e.g. BikeControl)
        // in that case use the generic 'up'/'down' keys (as Zwift Click), to avoid a double adjustment
        const combine = (shift:number, difficulty:number, key:string) => {
            if (released.has(shift) && released.has(difficulty)) {
                keys.push({key, duration:released.get(shift)})
                released.delete(shift)
                released.delete(difficulty)
            }
        }
        combine(BUTTON_SHIFT_UP, BUTTON_INCREASE_DIFFICULTY, 'up')
        combine(BUTTON_SHIFT_DOWN, BUTTON_DECREASE_DIFFICULTY, 'down')

        released.forEach( (duration,buttonId) => {
            keys.push({key:BUTTON_KEYS.get(buttonId), duration})
        })
        return keys
    }

    protected async sendAppInfo():Promise<void> {
        try {
            const appId = Buffer.from('incyclist')
            const buttons = Array.from(BUTTON_KEYS.keys())

            // [type] [version] [app id length] [app id] [app version length (not sent)] [button count] [button ids]
            const message = Buffer.from([MSG_APP_INFO, 0x01, appId.length, ...appId, 0x00, buttons.length, ...buttons])
            await this.write(OBC_APP_INFO, message, {withoutResponse:true})
        }
        catch(err) {
            // app information is optional, the controller will still send all buttons
            this.logEvent({message:'warning', fn:'sendAppInfo', error:err.message})
        }
    }

    reset(): void {
        this.buttonStates = new Map()
    }

}
