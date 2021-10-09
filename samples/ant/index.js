const Ant = require('gd-ant-plus');
//const {AntScanner} = require('incyclist-devices');
const {AntScanner} = require('../../lib/DeviceSupport');
const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog')

EventLogger.registerAdapter(new ConsoleAdapter()) 
const logger = new EventLogger('AntSampleApp')
const foundDevices = [];


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

    setTimeout( ()=> {

        if ( foundDevices.length>0) {
            foundDevices.forEach( device => {
                start(device);
            })
            
        }       
        else {
            console.log('no devices found');
            process.exit()
        }


    },1000)


}

const start = (device) => {

    return new Promise( (resolve,reject)=> {
        logger.log('starting adapter')
        device.start().catch( (err) => reject(err))
        .finally(()=>{ 
            if ( device.isBike() ) {
                logger.log('set Target Power')
                device.sendTargetPower(100).catch((err)=>logger.logEvent({message:'error',error:err.message}));    
            }
            device.onData( (data)=> { 
                logger.logEvent( {message:'device data',device:device.getName(),data})
            })
    
            setTimeout( ()=>{
                logger.log('stopping adapter')
                device.stop()
                .then( ()=> { logger.log('stopped'); resolve(true)})
                .catch( err => reject(err))
                .finally( )
            },10000)})
    
    } )
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

logger.log('ANT Sample')
var args = process.argv.slice(2);

const scanner = new AntScanner(Ant);
if ( process.env.DEBUG)
    scanner.logger = logger;

if ( args.length<2) {
    scanner.scan({id:0,timeout:5000,onDeviceFound,onScanFinished})
}
else {
    const profile = getProfile(args[0])
    const device = scanner.add( { deviceID:args[1],profile })
    logger.log('starting adapter')
    start(device)
    .then( ()=> {
        logger.log('2nd try')
        start(device).then( ()=> process.exit).catch( ()=> process.exit())
    })
}
