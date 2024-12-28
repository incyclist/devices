const {AdapterFactory, IncyclistCapability, BleInterfaceFactory} = require('incyclist-devices')
const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');

const { Bonjour } = require('bonjour-service')
const net = require('net');

const createBinding = ()=>{
    return {
        mdns: new MDNSBinding(),
        net: {
            createSocket: ()=>new net.Socket()
        } 
    }
}

class MDNSBinding {
    
    connect() {
        this.bonjour = new Bonjour()
        
    }

    disconnect() {
        if (this.bonjour) {
            this.bonjour.destroy()
            this.bonjour = null
        }
    }

    find(opts , onUp) {
        this.bonjour.find(opts, (s)=>{ 
            this.handleAnnouncement(s,onUp) 
        })
    }       

    handleAnnouncement(service,callback) {
        const {name,txt,port,referer,protocol} = service
        const announcement = {
            name,address:referer?.address,protocol,port,
            serialNo:txt?.['serial-number'], 
            serviceUUIDs:txt?.['ble-service-uuids']?.split(',')
        }
        if (callback)
            callback(announcement)
    }
        
}


EventLogger.registerAdapter(new ConsoleAdapter()) 

const logger = new EventLogger('DirectConnectSampleApp')

logger.log('DC Sample')
const args= process.argv.slice(2);




function runDevice(device) {
    
    logger.logEvent( {message:'starting device',device:device.getDisplayName()})        

    return new Promise ( (resolve) => {

        const start = async () => {
            device.onData( (data)=> { logger.logEvent( {message:'onData',device:device.getDisplayName(),data}) })
            device.on('disconnected', ()=>{console.log('disconnected')})
            device.on('device-info', (info)=>{console.log('device-info:',info)})
    
            try {
                await device.start();
            }
            catch(err) {
                logger.logEvent( {message:'Device start failed', error:err.message})        
                resolve(true);
                return
            }
    
            let iv;
            if (device.hasCapability(IncyclistCapability.Control)) {
                logger.logEvent( {message:'Device is controllable'})   
                let slope =0
                // setting power to 200W every 1s
                iv = setInterval( async ()=>{
                    //logger.logEvent( {message:'setting Power',power:200,device:device.getName()})        
                    await device.sendUpdate( {slope});
                    slope+=0.1
            
                }, 1000)
        
            }

            // stopping device after 30s
            setTimeout( async ()=>{
                logger.logEvent( {message:'stopping device',device:device.getName()})        
                if (iv) clearInterval(iv)
                await device.stop();   
                resolve(true)
            }, 30000)
    
    
        }

        start()
    
    
    })

}

async function main(props={}) {
    const binding = createBinding()
    const dc = BleInterfaceFactory.createInstance('wifi')
    dc.setBinding( binding )
    
    

    logger.logEvent({message:'Connecting     ...'})
    const connected = await dc.connect()
    if (!connected) {
        logger.logEvent({message:'Could not connect  ...'})
        return;
    }

    
        if (props.name) {
             const {profile,deviceID} = props
            const settings={interface:'wifi', profile, deviceID}
    
                const device = AdapterFactory.create(settings)
             await runDevice(device)           
        }
        else {
            dc.on('device',async (settings,announcement)=> {
                logger.logEvent({message:'device found',settings, announcement})
                dc.stopScan()
                const device = AdapterFactory.create(settings)
                await runDevice(device)           
            })
        
                    
            //ant.on('data',(...args)=> console.log(...args))
    
            
            const devices = await dc.scan( { timeout: 10000})
            logger.logEvent({message:'devices found', devices})
    
            if (devices?.length>0) {
                 const device = AdapterFactory.create(devices[0])
                 await runDevice(device)           
            }
        }
            
    

    await dc.disconnect();     
   

}

let props={}
if (args.length===2) {
    props.deviceID = args[0]
    props.profile  = args[1]
}

process.on('SIGINT', () => process.exit() );  // CTRL+C
process.on('SIGQUIT', () => process.exit() ); // Keyboard quit
process.on('SIGTERM', () => process.exit() ); // `kill` command 

main(props)
