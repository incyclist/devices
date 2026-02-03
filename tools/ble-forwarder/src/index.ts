import noble, { Characteristic, Peripheral, Service } from '@stoprocent/noble';
import bleno  from "@stoprocent/bleno";

import { EventEmitter }from 'events';
import { parseArgs } from './parseArgs';


class BleForwarder {
    protected scanTimeout
    protected deviceName:string
    protected announceName:string
    protected isAnnounced: boolean

    protected connectedPeripheral: Peripheral
    protected connectedServices: Service[]
    protected announcedPeripheral

    constructor( props:{deviceName:string, announceName:string}) {
        this.deviceName = props.deviceName
        this.announceName = props.announceName
        this.isAnnounced = false
    }


    async onDeviceFound (peripheral:Peripheral) {

        if (this.scanTimeout) {
            clearTimeout(this.scanTimeout)
            this.scanTimeout = undefined
            console.log('device can be forwarded:', peripheral.advertisement.localName)
            await noble.stopScanningAsync();
            console.log('scan stopped')

            await this.connect(peripheral)
            await this.forward()

        }

    }

    async forwardCharacteristicData( service:Service, characteristic:Characteristic, data:Buffer) {

    }

    async connect(peripheral:Peripheral) {
        try {
            this.connectedServices = []

            await peripheral.connectAsync()
            console.log('device connected')
            this.connectedPeripheral = peripheral

            const { services } = await peripheral.discoverAllServicesAndCharacteristicsAsync();
            
            console.log(`adding ${services.length} services `)
            
            for (const service of services) { 

                if (service.uuid==='181c')
                    continue
                console.log(`adding service #${services.indexOf(service)}: ${service.uuid} `)
                try {
                    for (const c of service.characteristics ) {

                        if (c.properties.includes('notify') || c.properties.includes('indicate')|| c.properties.includes('write')) {
                            try {

                                console.log(`subscribing to ${service.uuid}:${c.uuid} ...` )
                                await c.subscribeAsync()
                                console.log(`subscribed to ${service.uuid}:${c.uuid}`)
                                c.on('data', (data) => {
                                    if (this.connectedServices?.length) {
                                        console.log(new Date().toISOString(),`\x1b[32m> ${c.uuid} ${Buffer.from(data).toString('hex')}\x1b[0m`)
                                        this.forwardCharacteristicData(service, c, data)
                                    }
                                })
                            }
                            catch(err) {
                                console.log(`could not subsribe to ${service.uuid}:${c.uuid}, reason: ${err.message}`)
                            }
                            
                        }
                    }
                    console.log(`service #${services.indexOf(service)}: ${service.uuid} completed`)
                }
                catch(err) {
                    console.log(`service #${services.indexOf(service)}: ${service.uuid} failed`, err.message, err.stack)
                }
            }
            console.log('connect completed')
            this.connectedServices = services
            
                

            
        }
        catch(err) {
            console.log('could not connect', err.message)
        }

    }

    async forward() {
        if (!this.connectedPeripheral)  {
            console.log('device forwarding skippd')
            return;
        }

        console.log('starting to forward ...')
        const peripheral = this.connectedPeripheral
        return new Promise<void>( (done) => {
            bleno.startAdvertising(this.announceName, peripheral.advertisement.serviceUuids, (error)=>{
                if (error) {
                    console.log(' could not advertise', error)
                    done()
                }
                else {
                    console.log(`device announced as ${this.announceName}`)
                    this.isAnnounced = true
                    done()

                }
            });
        })

    }



    async onTimeout (){
        this.scanTimeout = undefined
        await noble.stopScanningAsync();
        this.exit(false)
    }

    async exit (verbose=true) {
        if (verbose)
            console.log('terminating ...')
        try {
            try { await bleno.stopAdvertisingAsync(); }  catch {}
            
            noble.stop()
            bleno.stop()
        }
        catch {}

    }

    async run  ()  { 
        const {deviceName, announceName} = this
        console.log('deviceName: ', deviceName)
        console.log('announceName: ', announceName)

        const emitter:EventEmitter = new EventEmitter()
        
        this.scanTimeout = setTimeout( ()=>{
            emitter.emit('timeout')
        }, 30000)

        emitter.once('found' ,this.onDeviceFound.bind(this))
        emitter.once('timeout' ,this.onTimeout.bind(this))

        try{
            await bleno.waitForPoweredOnAsync();
            await noble.waitForPoweredOnAsync();
            await noble.startScanningAsync();

            for await (const peripheral of noble.discoverAsync()) {
                if (peripheral.advertisement.localName)
                    console.log(`Found device: ${peripheral.advertisement.localName ?? 'Unknown'}`);          
                if (peripheral.advertisement.localName === deviceName) {
                    emitter.emit('found', peripheral)
                    
                }
            }
        }
        catch(err) {
            console.error('Discovery error:', err);
            await noble.stopScanningAsync();
        }
    }    
}


const args = parseArgs()
const forwarder = new BleForwarder(args)
forwarder.run()

process.on('SIGINT', () => forwarder.exit() );  // CTRL+C
process.on('SIGQUIT', () => forwarder.exit() ); // Keyboard quit
process.on('SIGTERM', () => forwarder.exit() ); // `kill` command 


