const { InterfaceFactory ,AdapterFactory} = require('incyclist-devices')
const {EventLogger,ConsoleAdapter} = require( 'gd-eventlog');

const os = require('os')
const Noble = require('noble/lib/noble');
const {WinrtBindings} = require('./bindings')
const defaultBinding = require('noble/lib/resolve-bindings');
const { sleep } = require('incyclist-devices/lib/utils/utils');
const platform = os.platform()

EventLogger.registerAdapter(new ConsoleAdapter()) 
const Logger = new EventLogger('BleSampleApp')

let ble,binding

// Select binding (based on OS)
switch (platform) {
    case 'win32': binding= new Noble(new WinrtBindings());break;
    case 'linux': break; // TODO
    case 'darwin': binding = new Noble(defaultBinding()); break;
    default:
        process.exit()
}

const parseArgs = ()=> {
    const args = process.argv.slice(2)

    if ( args.length===0 || args[0]==='scan') { 
        let protocols;
        if (args.length>1) {
            protocols = args[1].split(',')
            
        }
        return { command: 'scan',protocols }
    }
    if ( args.length>=3 && args[0]==='connect') { 
        const props = { command: 'connect' }
        const device = args[2].split('=')

        if (device[0].toLocaleLowerCase()==='id')
            props.id = device[1]
        else if (device[0].toLocaleLowerCase()==='address')
            props.address = device[1]
        else if (device[0].toLocaleLowerCase()==='name')
            props.name = device[1]
        else 
            props.name = args[2];

        props.protocol = args[1]
        return props
    }
    if ( args[0]!=='scan') {
        console.log('Usage: node index.js <command>')
        console.log('Commands:')
        console.log('  scan [proctocol,protocol,....]')
        console.log('  connect <protocol> [id=device id|name=device name|address=device address]')
    }

    return 
}

const  main = async(props = {})=> {
   
    
    ble = InterfaceFactory.create('ble', {logger:Logger,binding})
    ble.on('device', device=>{ console.log('> found device',device)})

    ble.on('error',console.log)
    binding.on('error',(err)=>{console.log('>binding error',err.message)})

    const {command,id,name,address,protocol,protocols} = props
    
    if (command==='scan') {
        
        const connected = await ble.connect({timeout:20000});
        if (!connected) {
            console.log('> error could not connect')
            onAppExit()
            return;
        }

        let cntStartet = 0;
        let devices = await ble.scan({protocols,timeout:5000})
        if (devices.length===0) {
            await sleep(2000)
            devices = await ble.scan({protocols,timeout:5000})
        }

        if (devices.length>0) {
            console.log('> info', `${devices.length} device(s) found`)
            devices.forEach( async device => {
                const adapter = AdapterFactory.create(device)
                try {
                    const started = await adapter.start()
                    if (started) {
                        adapter.on('data', (device,data)=>{ console.log('> data', {...device, ...data})})
                        cntStartet++;
                    }
                }
                catch(err) {

                    console.log('> error',err.message)
                    await adapter.close()

                }
            })
        }
        else {
            console.log('> info', 'no device found')
        }
        setTimeout( ()=>{
            if (cntStartet===0) {
                onAppExit()    
            }
        }, 1000)
    }
    else {
       
        const adapter = AdapterFactory.create( {interface: 'ble',protocol,id,name,address})

        try {
            const started = await adapter.start()
            if (started)
                adapter.on('data', (device,data)=>{ console.log('> data', {...device, ...data})})
        }
        catch(err) {
            console.log('> error',err.message)            
            onAppExit()            
        }
        
    }
}

const onAppExit = async()=> { 
    if (!ble)
        return process.exit();

    await ble.disconnect();
    process.exit()

}

process.on('SIGINT', () => onAppExit() );  // CTRL+C
process.on('SIGQUIT', () => onAppExit() ); // Keyboard quit
process.on('SIGTERM', () => onAppExit() ); // `kill` command 

const args = parseArgs()
main(args)

