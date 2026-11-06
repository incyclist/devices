import { LegacyProfile } from "../../antv2/types.js";
import { TBleSensor } from "../base/sensor.js";
import { BleProtocol } from "../types.js";
import { matches } from "../utils.js";
import { OBC_APP_INFO, OBC_BUTTON_STATE, OBC_SERVICE } from "./consts.js";

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

// buttons that were pressed with the same message, i.e. one physical button
type ButtonPress = {
    buttons: number[]
    pressed: number[]
    timestamp: number
}

export class BleOpenBikeControlSensor extends TBleSensor {
    static readonly profile:LegacyProfile  = 'Controller'
    static readonly protocol:BleProtocol = 'openbikecontrol'
    static readonly services =  [OBC_SERVICE];
    static readonly characteristics =  [];
    static readonly detectionPriority = 0;     // trainers that also offer OpenBikeControl should be detected as trainer

    protected buttonStates: Map<number, ButtonPress> = new Map()

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

            // a controller may send several actions for one physical button (e.g. BikeControl), 
            // so all buttons pressed with the same message are treated as one press, which results in one key.
            // keys are reported on release, same as for the Zwift controllers
            const press:ButtonPress = {buttons:[], pressed:[], timestamp:Date.now()}
            const released:ButtonPress[] = []
            for (let i=1; i+1<data.length; i+=2) {
                const buttonId = data[i]
                if (!BUTTON_KEYS.has(buttonId))
                    continue

                const pressed = data[i+1]!==0x00
                const prev = this.buttonStates.get(buttonId)
                if (pressed && !prev) {
                    press.buttons.push(buttonId)
                    press.pressed.push(buttonId)
                    this.buttonStates.set(buttonId, press)
                }
                else if (!pressed && prev) {
                    this.buttonStates.delete(buttonId)
                    prev.pressed = prev.pressed.filter( id=> id!==buttonId)
                    if (prev.pressed.length===0)
                        released.push(prev)
                }
            }

            released.forEach( p => {
                const key = this.getKey(p.buttons)
                const duration = Date.now()-p.timestamp
                const {name,address} = this.peripheral?.getInfo() ?? {}
                this.logEvent({message:'key pressed', key, name,address, duration})
                this.emit('key-pressed', {key, duration})
            })
        }
        catch(err) {
            this.logEvent({message:'error', fn:'onButtonState', error:err.message, stack:err.stack})
        }
    }

    protected getKey(buttons:number[]):string {
        // shift and difficulty for the same button: use the generic 'up'/'down' keys (as Zwift Click), 
        // which adjust gear or power depending on the mode, to avoid a double adjustment
        if (buttons.includes(BUTTON_SHIFT_UP) && buttons.includes(BUTTON_INCREASE_DIFFICULTY))
            return 'up'
        if (buttons.includes(BUTTON_SHIFT_DOWN) && buttons.includes(BUTTON_DECREASE_DIFFICULTY))
            return 'down'

        // otherwise the first supported action in the order of BUTTON_KEYS
        const buttonId = Array.from(BUTTON_KEYS.keys()).find( id=> buttons.includes(id))
        return BUTTON_KEYS.get(buttonId)
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
