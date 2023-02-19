const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');
const { autoDetect } = require('@serialport/bindings-cpp')
const {useSerialPortProvider} = require('incyclist-devices');
const { SerialPort } = require('serialport');
const { MockBinding,MockPortBinding } = require('@serialport/binding-mock')

EventLogger.registerAdapter(new ConsoleAdapter()) 
const logger = new EventLogger('DaumClassicSample');
//const {DeviceRegistry, useSerialPortProvider} = require('../../lib/DeviceSupport');

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

function runDevice(device) {
    logger.logEvent( {message:'starting device',device:device.getName()})        
    
    if ( process.env.DEBUG) {
        device.logger = logger;
        device.bike.logger = logger;
    }
    device.onData( (data)=> { logger.logEvent( {message:'onData',data}) })

    return new Promise( resolve => {
        start(device)
        .then(()=>{
            let slope =0
            // setting power to 200W every 1s
            const iv = setInterval( async ()=>{
                //logger.logEvent( {message:'setting Power',power:200,device:device.getName()})        
                await device.sendUpdate( {slope});
                slope+=0.1
        
            }, 1000)
    
            // stopping device after 10s
            setTimeout( async ()=>{
                logger.logEvent( {message:'stopping device',device:device.getName()})        
                await device.stop();    
                logger.log('stopped')
                resolve(true);
            }, 10000)
        })
        .catch((err)=>{resolve(false)})
    })

}




async function run() {

    const spp = useSerialPortProvider();

    if (process.env.MOCK) {

        console.log('using MockBinding for ports',process.env.MOCK )
        const mockPorts = process.env.MOCK.split(',')
        MockBinding.reset();
        mockPorts.forEach( port => MockBinding.createPort(port))
        spp.setBinding('serial', MockBinding)
    }
    else {
        spp.setBinding('serial', autoDetect())
        //spp.setLegacyClass('serial', SerialPort)
    
    }
    


    var args = process.argv.slice(2);
    if (args.length<1) {
        const devices = await scan();
        if (devices && devices.length>0) {
            const device = devices[0];
            await runDevice(device)
            process.exit();
    
        }
        else {
            process.exit();
        }
    }
    else {
        const scanner = DeviceRegistry.findByName('Daum Classic');
        
        const device = scanner.add( { port:args[0],opts:{logger} })
        device.logger = logger;
        await runDevice(device)      
        console.log('2nd try...')
        await runDevice(device)
        process.exit();
}
}

run();

