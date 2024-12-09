const {AdapterFactory, InterfaceFactory,IncyclistCapability} = require('incyclist-devices')
const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');
const {AntDevice} = require('incyclist-ant-plus/lib/bindings');


EventLogger.registerAdapter(new ConsoleAdapter()) 

const logger = new EventLogger('AntSampleApp')
const isDebug = process.env.DEBUG

logger.log('ANT Sample')
var args= process.argv.slice(2);

function runDevice(device) {
    
    logger.logEvent( {message:'starting device',device:device.getDisplayName()})        

    return new Promise ( async (resolve) => {


        device.onData( (data)=> { logger.logEvent( {message:'onData',device:device.getDisplayName(),data}) })
        device.on('disconnected', ()=>{console.log('disconnected')})
        device.on('device-info', (info)=>{console.log('device-info:',info)})

        try {
            await device.start();
        }
        catch(err) {
            logger.logEvent( {message:'Device start failed', error:err.message})        
            return resolve(true);
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
    
    })

}

async function main(props={}) {

    logger.logEvent({message:'Opening connection to ANT-Stick ...'})
    const connected = await ant.connect()
    if (!connected) {
        logger.logEvent({message:'Could not connect to ANT-Stick ...'})
        return;
    }

    if (props.deviceID && props.profile) {
        const {profile,deviceID} = props
        const settings={interface:'ant', profile, deviceID}

        const device = AdapterFactory.create(settings)
        await runDevice(device)           
    }
    else {
        
        //ant.on('data',(...args)=> console.log(...args))
        ant.on('device',(...args)=> console.log(...args))

        const devices = await ant.scan( { timeout: 10000})
        logger.logEvent({message:'devices found', devices})

        if (devices.length>0) {
            const device = AdapterFactory.create(devices[0])
            await runDevice(device)           
        }
    }
    await ant.disconnect();     
   

}

let props={}
if (args.length===2) {
    props.deviceID = args[0]
    props.profile  = args[1]
}

process.on('SIGINT', () => process.exit() );  // CTRL+C
process.on('SIGQUIT', () => process.exit() ); // Keyboard quit
process.on('SIGTERM', () => process.exit() ); // `kill` command 

const ant = InterfaceFactory.create('ant',{logger, log:isDebug, binding:AntDevice})
main(props)
