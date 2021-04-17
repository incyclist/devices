const Ant = require('gd-ant-plus');
//const {AntScanner} = require('incyclist-devices');
const {AntScanner} = require('../../lib/DeviceSupport');
const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog')

EventLogger.registerAdapter(new ConsoleAdapter()) 
const logger = new EventLogger('AntSampleApp')

const foundDevices = [];

const logData = data => { logger.logEvent( {message:'received', data})}

const onDeviceFound = (device,protocol) => {
    try {
        console.log(device.getName())
    }
    catch(err) {console.log(err)}
    foundDevices.push(device);
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
                    logger.log('set Target Power')
                    device.sendTargetPower(100).catch((err)=>logger.logEvent({message:'error',error:err.message}));
                    setTimeout( ()=>{
                        logger.log('stopping adapter')
                        device.stop()
                        .catch()
                        .finally( ()=>{ setTimeout( ()=>{ 
                            logger.log('starting adapter'); 
                            device.start()
                                .then(()=> device.stop())
                                .then(()=> process.exit())

                            }, 3000)})
                },3000)})


            })
            
        }       
        else {
            console.log('no devices found');
            process.exit()
        }


    },1000)


}

const scanner = new AntScanner(Ant);
scanner.scan({id:0,timeout:5000,onDeviceFound,onScanFinished})

