const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');

EventLogger.registerAdapter(new ConsoleAdapter()) 
const logger = new EventLogger('DaumClassicSample');

const {scan} = require('./scan')

function start(device) {

    return new Promise( async (resolve,reject)=>{
        try {
            await device.start();
            resolve(true);
        } catch (e) {
            logger.logEvent( {message:'error',error:e.message,device:device.getName()})        
            setTimeout(async ()=>{
                try {
                    await device.start();
                    resolve(true)
                } catch (e1) {
                    logger.logEvent( {message:'error',error:e.message,device:device.getName()})        
                    reject();
                }
    
            },30000);
        }
    
    });

}

async function run() {
    const devices = await scan();
    if (devices && devices.length>0) {
        const device = devices[0];

        logger.logEvent( {message:'starting device',device:device.getName()})        

        if ( process.env.DEBUG) {
            device.logger = logger;
            device.bike.logger = logger;
        }
        device.onData( (data)=> { logger.logEvent( {message:'onData',data}) })

        start(device)
            .then(()=>{
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
        })
            .catch(()=>{process.exit()})



    }
    else {
        process.exit();
    }
}

run();

