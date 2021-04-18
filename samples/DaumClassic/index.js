const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');

EventLogger.registerAdapter(new ConsoleAdapter()) 
const logger = new EventLogger('DaumClassicSample');

const {scan} = require('./scan')

async function run() {
    const devices = await scan();
    if (devices && devices.length>0) {
        const device = devices[0];

        logger.logEvent( {message:'starting device',device:device.getName()})        
        device.onData( (data)=> { logger.logEvent( {message:'onData',data}) })
        await device.start();

        // setting power to 200W after 5s
        setTimeout( async ()=>{
            logger.logEvent( {message:'setting Power',power:200,device:device.getName()})        
            await device.sendUpdate( {targetPower:200});
    
        }, 5000)

        // stopping device after 10s
        setTimeout( async ()=>{
            logger.logEvent( {message:'stopping device',device:device.getName()})        
            await device.stop();        
            process.exit();
        }, 10000)
    }
    else {
        process.exit();
    }
}

run();

