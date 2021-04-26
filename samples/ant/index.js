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
                logger.log('starting adapter')
                device.start().catch()
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
                        .catch()
                        .finally( ()=>{ setTimeout( ()=>{ 
                            logger.log('starting adapter'); 
                            device.start()
                                .then(()=> device.stop())
                                .then(()=> process.exit())

                            }, 1000)})
                    },10000)})


            })
            
        }       
        else {
            console.log('no devices found');
            process.exit()
        }


    },1000)


}

logger.log('ANT Sample')

const scanner = new AntScanner(Ant);
if ( process.env.DEBUG)
    scanner.logger = logger;
    
scanner.scan({id:0,timeout:5000,onDeviceFound,onScanFinished})

