const {EventLogger} = require( 'gd-eventlog');
const net = require ('net')
const {DeviceRegistry,INTERFACE} = require('../../lib/DeviceSupport');
const { networkInterfaces } = require('os');
const SerialPort = require('serialport');

const logger = new EventLogger('DaumPremiumSample')
const DEFAULT_SCAN_TIMEOUT = 10000; 

const _devices = [];

const onDeviceFound = (device,protocol) => {
    console.log(device.getName())
    _devices.push(device);
    logger.logEvent( {message: 'device found',name:device.getName(),port:device.getPort(), protocol:protocol.getName()})
}

const onScanFinished = (id) => {
    logger.logEvent( {message: 'scan finished',id})
}

function scanPort( host,port) {
    
    return new Promise( (resolve,reject) => {
        try {
            const socket = new net.Socket();
            socket.setTimeout(100,(e) =>{})
            socket.on('timeout',()=>{ reject(0) })
            socket.on('error',(err)=>{ reject(0) })
    
            socket.on('ready',()=>{
                console.log(host,'connected');
                resolve(host)
                socket.destroy();
            })
            socket.connect( port, host );
        }
        catch (err) {
            reject(err)
        }
    
    })
}


function scan(timeout=DEFAULT_SCAN_TIMEOUT) {

    const nets = networkInterfaces();
    const results = []

    const names = Object.keys(nets);
    names.forEach( name => {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                results.push(net.address);
            }
        }
    })

   
    const address = Object.keys(networkInterfaces())
    // flatten interfaces to an array
    .reduce((a, key) => [
        ...a,
        ...networkInterfaces()[key]
    ], [])
    // non-internal ipv4 addresses only
    .filter(iface => iface.family === 'IPv4' && !iface.internal && iface.netmask==='255.255.255.0')
    .map( iface => { 
        const parts = iface.address.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}`    
    })

    const subnets  = address.filter((x, i) => i === address.indexOf(x))
    console.log(subnets)


    const hosts = [];
    const range = [];
    for (let i=1;i<255;i++) range.push(i)

    subnets.forEach( sn => {
        range.forEach( j => {
            const host = `${sn}.${j}`
            scanPort(host,51955).then( r => { console.log(host,r); hosts.push(r)}).catch(()=>{})
        })
    })


    return new Promise( resolve => {
        setTimeout( ()=>{

            console.log(hosts)
            const host = hosts.length>0 ? hosts[0] : '127.0.0.1';

            logger.log('starting scan...')
    
            const scanner = DeviceRegistry.findByName('Daum Premium');
            scanner.setNetImpl(net);
            scanner.setSerialPort(SerialPort);
            scanner.logger = logger;
            
            const props = {id:0, host, interface:INTERFACE.TCPIP, onDeviceFound,onScanFinished}
            scanner.scan(props)

            SerialPort.list().then( portList => {
                const ports = portList.map( i => i.path)
                logger.logEvent( {message: 'found ports',ports})

       
                ports.forEach( (port,idx) => {
                    const serialProps = {id:idx, port, interface:INTERFACE.SERIAL, onDeviceFound,onScanFinished,logger}
                    scanner.scan(serialProps)
                });
            });        

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
    
        },3000)    
    

    })

}


module.exports = { scan}