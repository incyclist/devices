const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');
const {DeviceRegistry,INTERFACE} = require('../../lib/DeviceSupport');
const SerialPort = require('serialport');
const net = require ('net')

EventLogger.registerAdapter(new ConsoleAdapter()) 
const logger = new EventLogger('DaumPremiumSample');

const {scan} = require('./scan')

 function runDevice(device) {
    logger.logEvent( {message:'starting device',device:device.getName(),port:device.getPort()})        

    return new Promise ( async (resolve) => {
        device.onData( (data)=> { logger.logEvent( {message:'onData',data}) })
        await device.start();
        let slope =0
        // setting power to 200W every 1s
        const iv = setInterval( async ()=>{
            //logger.logEvent( {message:'setting Power',power:200,device:device.getName()})        
            await device.sendUpdate( {slope});
            slope+=0.1
    
        }, 1000)
    
        // stopping device after 60s
        setTimeout( async ()=>{
            logger.logEvent( {message:'stopping device',device:device.getName()})        
            clearInterval(iv)
            await device.stop();        

            resolve(true)
        }, 60000)
    
    })

}
async function run() {


    var args = process.argv.slice(2);
    if (args.length<1) {
        const devices = await scan();
        if (devices && devices.length>0) {
            const device = devices[0];
            await runDevice(device)
            process.exit()
        }
        else {
            process.exit();
        }
    }
    else {
        const scanner = DeviceRegistry.findByName('Daum Premium');
        scanner.setNetImpl(net);
        scanner.setSerialPort(SerialPort);

        const portName = args[0]
        const parts = portName.split(':')
        let props; 
        if (parts.length===1) {
            const port = portName;
            props = {port,interface:INTERFACE.SERIAL}
        }
        else {
            const host = parts[0];
            const port = parts[1]
            props = {host,port,interface:INTERFACE.TCPIP}
        }

        logger.logEvent({message:'adding device',props})
        const device = scanner.add( props)

        try {
            await runDevice(device)      
            console.log('2nd try...')
            await runDevice(device)
    
        }
        catch(err) {
            console.log('~~~ Error',err)
        }
        process.exit();

    }
}

run();

