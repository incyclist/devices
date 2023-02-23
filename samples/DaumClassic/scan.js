const {EventLogger} = require( 'gd-eventlog');
const {useSerialPortProvider,DeviceRegistry,INTERFACE} = require('incyclist-devices');

const logger = new EventLogger('DaumClassicSample')
const DEFAULT_SCAN_TIMEOUT = 10000; 

const _devices = [];
const spp = useSerialPortProvider()

const onDeviceFound = (device,protocol) => {
    _devices.push(device);
    logger.logEvent( {message: 'device found',name:device.getName(),port:device.getPort(), protocol:protocol.getName()})
}

const onScanFinished = (id) => {
    logger.logEvent( {message: 'scan finished',id})
}

function scan(timeout=DEFAULT_SCAN_TIMEOUT) {

    return new Promise( resolve => {
        logger.log('starting scan...')

        spp.list('serial').then( portList => {
            const ports = portList.map( i => i.path)
            logger.logEvent( {message: 'found ports',ports})
            const scanner = DeviceRegistry.findByName('Daum Classic');

        
            ports.forEach( (port,idx) => {
                const props = {id:idx, port, interface:INTERFACE.SERIAL, onDeviceFound,onScanFinished,logger}
                scanner.scan(props)
            });
        
            setTimeout( ()=>{
                logger.log('timeout')
                ports.forEach( (port,idx) => {
                    const props = {id:idx, port, interface:INTERFACE.SERIAL, onDeviceFound,onScanFinished}
                    scanner.stopScan(props)
                });
    
                const iv= setInterval( ()=>{ 
                    if( !scanner.isScanning()) {
                        clearInterval(iv)
                        resolve(_devices)
                    }
                },100)
            }, timeout)
    
        })    
    })

}


module.exports = { scan}