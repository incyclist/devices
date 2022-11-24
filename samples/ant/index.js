const {AntDevice} = require('incyclist-ant-plus/lib/ant-device')
const Ant = require('gd-ant-plus')
    

const {AntScanner,AntProtocol,AntInterface, DeviceRegistry, } = require('incyclist-devices')
const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');
const {mapAntProfile } = require('../../lib/antv2/incyclist-protocol');

EventLogger.registerAdapter(new ConsoleAdapter()) 

const logger = new EventLogger('AntSampleApp')

logger.log('ANT Sample')
var args = process.argv.slice(2);

const INTERFACE = process.env.INTERFACE || 'v2'




async function main(props={}) {

    let protocol
    let ant

    if (INTERFACE==='old' || INTERFACE==='v1') {
        protocol = new AntScanner(Ant)
    }
    else  {
        ant = AntInterface.getInstance( {binding:AntDevice, debug:true,logger, startupTimeout:2000})
        await ant.connect();
        protocol = new AntProtocol()
    }


    if (props.deviceID && props.profile) {
        const device = protocol.add(props)
        device.onData( (...args)=> console.log('data',...args)  )
        device.on('disconnected', ()=>{console.log('disconnected')})
        const success = await  device.start();
        console.log( 'device start result',props,success)
    }
    else {

        const onDeviceFound = (device) => {
            console.log('found ',device.getName())
            protocol.stopScan()            
        }
        
        
        protocol.scan( {id:1, timeout: 10000,onDeviceFound, onScanFinished :()=> {
            console.log(' scan finished')
            ant.disconnect()
        }})    
    }

    

}

let props={}
if (args.length===2) {
    props.deviceID = args[0]
    props.profile  = mapAntProfile(args[1])
}

main(props)