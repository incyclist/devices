const Ant = require('gd-ant-plus');
//const {AntScanner} = require('incyclist-devices');
const {AntScanner} = require('../../lib/DeviceSupport');
const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');
const { exit } = require('process');

EventLogger.registerAdapter(new ConsoleAdapter()) 
const logger = new EventLogger('AntSampleApp')
const foundDevices = [];

logger.log('ANT Sample')
var args = process.argv.slice(2);

const scanner = new AntScanner(Ant);
if ( process.env.DEBUG)
    scanner.logger = logger;

// sleep function
const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}    

const onDeviceFound = (device,protocol) => {
    try {
        console.log(device.getName())
        foundDevices.push(device)
    }
    catch(err) {console.log(err)}
    logger.logEvent( {message: 'device found',name:device.getName(),port:device.getPort(), protocol:protocol.getName()})
}

const onScanFinished = (id) => {
    logger.logEvent( {message: 'scan finished',id})

    if ( foundDevices.length>0) {
        foundDevices.forEach( device => {
            start(device).catch();
        })
        
    }       
    else {
        console.log('no devices found');
        process.exit()
    }
}

const start = (device) => {

    return new Promise( (resolve,reject)=> {
        logger.log('starting adapter')
        device.logger = logger;
        device.start()
        .then( ()=> {
            console.log( '~~~ device started', device.getName())
            if ( device.isBike() ) {
                logger.log('set Target Power')
                device.sendTargetPower(100).catch((err)=>logger.logEvent({message:'error',error:err.message}));    
            }
            device.onData( (data)=> { 
                logger.logEvent( {message:'device data',device:device.getName(),data})
            })
    
            setTimeout( ()=>{

                // test stopping, restarting and scanning again
                
                logger.log('stopping adapter', device.getName())
                device.stop()
                .then( async ()=> { 
                    logger.log('stopped', device.getName()); 
                    await sleep(3000);

                    try {
                        logger.log('starting', device.getName()); 
                        await device.start();

                        logger.log('sending setTargePower', device.getName()); 
                        if ( device.isBike() )
                            await device.sendTargetPower(150);
                        await sleep(3000);
                        await device.stop();
                        logger.log('stopped', device.getName()); 
    
                    }
                    catch(err) {
                        
                        console.log(err)
                    }
                })
                .catch( err => {
                    console.log(err);
                    reject(err)
                })
                .finally( ()=> {
                    
                    scanner.scan({id:1,timeout:5000, onDeviceFound:(device,protocol) => console.log('found',device.getName()), onScanFinished:id=>process.exit()})
                    resolve(true)
                })

                
                
            },1000)
        })
   
        .catch( (err) => {
            console.log('ERROR',err);
            reject(err)
        }) 

    })
    
}

const getProfile = (argv) => {
    switch (argv.toLowerCase()) {
        case 'hrm': return 'Heartrate Monitor'
        case 'anthrm': return 'Heartrate Monitor'
        case 'ant+hrm': return 'Heartrate Monitor'
        case 'fe': return 'Smart Trainer'
        case 'antfe': return 'Smart Trainer'
        case 'ant+fe': return 'Smart Trainer'
        default: return
    }
}


if ( args.length<1) {
    scanner.scan({id:0,timeout:5000,onDeviceFound,onScanFinished})
}
else {
    // const profile = getProfile(args[0])
    const devices = [];

    args.forEach( arg => {
        const [p,deviceID] = arg.split(':');
        const device = scanner.add( { deviceID,profile:getProfile(p) })
        devices.push(device)
    })


    console.log(scanner.stick, scanner.devices.map( d => d.getName()));
    //process.exit();

    logger.log('starting gears')
    devices.forEach( device => start(device).catch(err=>logger.logEvent({message:'error',error:err.message})))

}
