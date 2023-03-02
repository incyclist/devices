const {INTERFACE,SerialPortProvider,TCPBinding,InterfaceFactory} = require('incyclist-devices');
const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');
const { AdapterFactory } = require('../../lib');
const { Daum8iMock,Daum8iMockImpl,Daum8MockSimulator } = require('incyclist-devices/lib/serial/daum/premium/mock');

EventLogger.registerAdapter(new ConsoleAdapter()) 
const logger = new EventLogger('DaumPremiumSample');

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

    logger.logEvent({message:'starting ...'})
    const isDebug = process.env.DEBUG
    var args = process.argv.slice(2);
    if (args.length<1) {

        const scanner  = InterfaceFactory.create('tcpip',{logger, log:isDebug})

        //const scanner = SerialInterface.getInstance({ifaceName:'tcpip',logger});
        const devices = await scanner.scan( {port:51955, timeout: 10000, protocol:'Daum Premium'})
        logger.logEvent({message:'devices found', devices})

        if (devices && devices.length>0) {
            const deviceSettings = devices[0];
            console.log(deviceSettings)
            const device = AdapterFactory.create(deviceSettings)
            //console.log(device)

            await runDevice(device)
            process.exit()
        }
        else {
            process.exit();
        }


    }
    else {
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
        

        const device = AdapterFactory.create( {...props, protocol:'Daum Premium'})

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

if (process.env.USE_MOCK) { 
    Daum8iMockImpl.reset();        
    SerialPortProvider.getInstance().setBinding('tcpip',Daum8iMock)
    Daum8iMockImpl.getInstance().createPort(process.env.USE_MOCK)
    Daum8iMockImpl.getInstance().setSimulator(process.env.USE_MOCK,new Daum8MockSimulator())           
}
else {
    SerialPortProvider.getInstance().setBinding('tcpip',TCPBinding)    
}

run();

