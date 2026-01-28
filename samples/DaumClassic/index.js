const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');
const { autoDetect } = require('@serialport/bindings-cpp')
const { AdapterFactory, InterfaceFactory} = require('incyclist-devices');
const { DaumClassicMock, DaumClassicSimulator, DaumClassicMockImpl } = require('incyclist-devices');

EventLogger.registerAdapter(new ConsoleAdapter()) 

const logger = new EventLogger('DaumClassicSample');

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
                clearInterval(iv)
                logger.log('stopped')
                resolve(true);
            }, 10000)
        })
        .catch((err)=>{resolve(false)})
    })
}


async function run() {


    const serial = InterfaceFactory.create('serial',{protocol:'Daum Classic'})

    if (process.env.MOCK) {
        logger.log('using MockBinding for ports',process.env.MOCK )

        const mockPorts = process.env.MOCK.split(',')

        DaumClassicMockImpl.reset();        
        const simulator = new DaumClassicSimulator();

        serial.setBinding(DaumClassicMock)

        mockPorts.forEach( port => {
            DaumClassicMock.createPort(port)
            DaumClassicMockImpl.getInstance().setSimulator(port,simulator)           
        })
        
    }
    else {
        serial.setBinding(autoDetect())
    }
    await serial.connect()
  

    var args = process.argv.slice(2);
    if (args.length<1) {
        logger.logEvent({message:'Scanning for devices ...'})

        serial.on('device',(args)=> logger.logEvent({message:'Device Detected',...args}))
    
        const devices = await serial.scan( { timeout: 10000,protocol:'Daum Classic'})
        logger.logEvent({message:'devices found', devices})
    
        if (devices.length>0) {
            const device = AdapterFactory.create(devices[0])
            await runDevice(device)           
        }
    }
    else {        
        const device = AdapterFactory.create({interface:serial, protocol:'Daum Classic',port:args[0], name:'Test'})       
        await runDevice(device)      
    }
}

process.on('SIGINT', () => process.exit() );  // CTRL+C
process.on('SIGQUIT', () => process.exit() ); // Keyboard quit
process.on('SIGTERM', () => process.exit() ); // `kill` command 


run();

