import { EventLogger,ConsoleAdapter } from "gd-eventlog"
import { AdapterFactory, AntInterface, InterfaceFactory, SerialScannerProps } from "../index"
import { sleep } from "../utils/utils";
import AntAdapter from "./base/adapter";

const {AntDevice} = require('incyclist-ant-plus/lib/bindings');

EventLogger.registerAdapter(new ConsoleAdapter()) 

describe('Ant+ Scan', () => {



    test('Simulate scan and pair', async () => {
        const logger = new EventLogger('AntSample')

        const ant = InterfaceFactory.create('ant',{logger, log:true, binding:AntDevice}) as unknown as AntInterface


        const scan = ():Promise<AntAdapter<any>|null> =>{
            logger.logEvent({message:'scanning ....'})

            let found = false

            return new Promise(async (resolve,reject)=>{
                const onData = (...args) =>{
                    console.log(...args)
                }
                const onDevice = async (settings)=> {
                        console.log(settings)
                        found = true
                        const adapter = AdapterFactory.create(settings)
        
                        await sleep(4000)
        
                        ant.off('device',onDevice)
                        ant.off('data',onData)
                        adapter.pause()
                        const stopped = await ant.stopScan()
                        console.log(stopped)
                        adapter.removeAllListeners('data')
                        resolve(adapter)
                }
        
                ant.on('device',onDevice)
                ant.on('data',onData)
        
                const devices = await ant.scan( { timeout: 10000} )
                logger.logEvent({message:'devices found', devices})
                if (!found)
                    resolve(null)
                
            })                    
        }



        const connected = await ant.connect()
        if (connected) { 
            const device = await scan()
            if (device) {
                //found.start()
                await device.stop()

                device.on('data',console.log)
                await device.start()

                await sleep(4000)
                await device.stop()
                
            }
            
            await ant.disconnect()
        }
        else (
            console.log('~~~ no ANT+ stick connected')
        )
        
    },40000)
})