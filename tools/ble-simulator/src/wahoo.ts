import bleno from '@stoprocent/bleno'
import CyclingPowerService from './emulator/services/csp'
import WahooAdvancdedFtmsService from './emulator/services/wahoo'

const NAME = 'KICKR SNAP 0815'

class WahooSimulator {
    protected to: NodeJS.Timeout
    protected isConnected: boolean
    protected bleStateChangeHandler = this.onBLEStateChange.bind(this)
    protected connectedPeripherals: string[] = []

    constructor() {
        process.env['BLENO_DEVICE_NAME'] = NAME        
    }

    onTimeout() {
        if (this.to && !this.isConnected) {
            console.log('Could not connect to BLE <reason: timeout>')
            clearTimeout(this.to)
            bleno.off('stateChange',this.bleStateChangeHandler)
            bleno.disconnect()
            process.exit(1)
        }
    }

    onConnected() {
        console.log('connected')
        this.isConnected = true
        if (this.to) {
            clearTimeout(this.to)
            delete this.to
        }

        console.log('start advertising ...')
        bleno.startAdvertising( NAME, ['1818'],(err)=>{
            
            if (err)
                console.log('could not start advertising - reason:', err.message)
        } )

        bleno.on('advertisingStart',()=>{
            console.log('started advertising')


            try {
                const CP = new CyclingPowerService()
                const Wahoo = new WahooAdvancdedFtmsService()
                bleno.setServices( [CP,Wahoo] )

                console.log('set services done')
            }
            catch(err) {
                console.log(err)
            }

            
        })

        bleno.on('accept', (cAddress) => { 
            if (!this.connectedPeripherals.includes(cAddress))
                this.connectedPeripherals.push(cAddress)
            console.log('client accepted: ' + cAddress + 'device connected: ' + this.connectedPeripherals.length, 
                this.connectedPeripherals.length>0 ? ':'+this.connectedPeripherals.join(',') :'') ;
            
        });
        
        bleno.on('disconnect', (cAddress) => {
            const idx = this.connectedPeripherals.indexOf(cAddress) 
            if (idx!==-1)
                this.connectedPeripherals.splice(idx,1 )

            console.log('client disconnected: ' + cAddress);               
            console.log('client accepted: ' + cAddress + 'device connected: ' + this.connectedPeripherals.length, 
                this.connectedPeripherals.length>0 ? ':'+this.connectedPeripherals.join(',') :'') ;
        })

        bleno.on('advertisingStartError', (error) => {
            console.log('advertisingStartError', error?.message)
        });

        bleno.on('servicesSet', (error) => {
            if (!error)
                console.log('Services set')
            else 
            console.log('Services set error', error.message)
        });

        bleno.on('servicesSetError', (error) => {

            console.log('Services set error', error?.message)
        });
        

    }

    onDisconnected() {
        this.isConnected = true
        console.log('diconnected')

    }

    onBLEStateChange(state) {
        if (state === 'poweredOn') {
            this.onConnected()
        }
        else {
            this.onDisconnected()
        }
    }

    start  () {
        console.log('connecting to BLE ....')

        if (!this.to)
            this.to = setTimeout( ()=>{this.onTimeout()}, 5000)

        bleno.on('stateChange',this.bleStateChangeHandler)


    }

}


export const main = async ()=>{
    const wahoo = new WahooSimulator()

    wahoo.start()
}

