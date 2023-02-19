const {EventLogger} = require( 'gd-eventlog');
const net = require ('net')
const {DeviceRegistry,INTERFACE,TCPBinding} = require('incyclist-devices');
const SerialPort = require('serialport');

const logger = new EventLogger('DaumPremiumSample')
const DEFAULT_SCAN_TIMEOUT = 10000; 
const DEFAULT_PORT = 51955;
const _devices = [];

const onDeviceFound = (device,protocol) => {
    _devices.push(device);
    logger.logEvent( {message: 'device found',name:device.getName(),port:device.getPort(), protocol:protocol.getName()})
}

const onScanFinished = (id) => {
    logger.logEvent( {message: 'scan finished',id})
}


async function scan(timeout=DEFAULT_SCAN_TIMEOUT) {

    const ports  = await TCPBinding.list(DEFAULT_PORT)
    const hosts = ports.map( p=> p.path)
    
    return new Promise( async resolve => {
        


            const host = hosts.length>0 ? hosts[hosts.length-1] : '127.0.0.1';

            logger.log('starting scan...')
    
            const scanner = DeviceRegistry.findByName('Daum Premium');
            scanner.setNetImpl(net);
            scanner.setSerialPort(SerialPort);
            scanner.logger = logger;
            
            const props = {id:0, host,port:DEFAULT_PORT, interface:INTERFACE.TCPIP, onDeviceFound,onScanFinished}
            scanner.scan(props)
            /*
            SerialPort.list().then( portList => {
                const ports = portList.map( i => i.path)
                logger.logEvent( {message: 'found ports',ports})

       
                ports.forEach( (port,idx) => {
                    const serialProps = {id:idx, port, interface:INTERFACE.SERIAL, onDeviceFound,onScanFinished,logger}
                    scanner.scan(serialProps)
                });
            });        
*/
            setTimeout( ()=>{
                logger.log('timeout')
                scanner.stopScan(props)
    
                const iv= setInterval( ()=>{ 
                    if( !scanner.isScanning()) {
                        clearInterval(iv)
                        resolve(_devices)
                        logger.logEvent( {message:'devices found:',devices:_devices})
                    }
                },100)
            }, timeout)
    
    

    })

}


module.exports = { scan}