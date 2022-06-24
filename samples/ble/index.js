const { BleInterface, BleHrmDevice,BleCyclingPowerDevice,BleFitnessMachineDevice} = require('incyclist-devices')
//const noble = require('noble-winrt')

const {WinrtBindings} = require('./bindings')
const Noble = require('noble/lib/noble')
const noble = new Noble(new WinrtBindings())

let ble;

const parseArgs = ()=> {
    const args = process.argv.slice(2)
    if ( args.length===0 || args[0]==='scan') { 
        return { command: 'scan' }
    }
    if ( args.length>=2 && args[0]==='connect') { 
        const props = { command: 'connect' }
        const device = args[1].split('=')
        if (device[0].toLocaleLowerCase()==='id')
            props.id = device[1]
        else if (device[0].toLocaleLowerCase()==='address')
            props.address = device[1]
        else if (device[0].toLocaleLowerCase()==='name')
            props.name = device[1]
        else 
            props.name = args[1];

        if (args.length>2 ) {
            props.profile = args[2]

        }
        
        console.log(props)
        return props
    }
    if ( args[0]!=='scan') {
        console.log('Usage: node index.js <command>')
        console.log('Commands:')
        console.log('  scan')
        console.log('  connect [id=device id|name=device name|address=device address]')
    }

    return 
}

const discover = (device) => {
    return new Promise( (resolve) => {
        device.peripheral.discoverServices(['1826','1818','180d'], (err,services) => { 
            resolve({err,services})
            console.log(err,services)
        })
    })
}

const  main = async(props = {})=> {

    console.log('Device Types:', BleInterface.deviceClasses)
    
    ble = new BleInterface()
    ble.setBinding(noble)
    //noble.init()
    //noble.on('discover',(d,a)=> console.log('discver',d,a))
    console.log('connecting ...')
    await ble.connect({timeout:5000});
    console.log('connected')

    let device
    if ( !props.command || props.command==='scan') {
        let devices = [];
        ble.on('device', async (d)=> {
            /*
            console.log('found',d.address)
            const p= d.peripheral;
            p.connect( (err)=>{
                p.discoverServices(['1826'], (err,services) => {
                    p.disconnect()
                    console.log(err,services.map(s => s.uuid))
                    
                        //process.exit()
                })
            })
            */
            
        })
        console.log('scanning ...')
        devices = await ble.scan( { deviceTypes:[BleHrmDevice,BleCyclingPowerDevice,BleFitnessMachineDevice], timeout:20000} );
        console.log('scan completed', devices.map(d => ({name:d.name, id:d.id, address:d.address,profile:d.getProfile() })))
        if (devices.length===0) {
            await ble.disconnect();
            process.exit()
        }    
        
        for (let i=0; i<devices.length; i++) {
            try {
                let device = devices[i]
                await discover(device)
                console.log( 'connecting to ',{name:device.name, id:device.id, address:device.address,profile:device.getProfile() })
                await  device.connect()
                device.on('data', (data)=> {                
                    console.log( 'device:',device.name,'data:', data)
                })
    
                console.log( 'connected to ',{name:device.name, id:device.id, address:device.address,profile:device.getProfile() })
            }
            catch(err) {
                console.log(err)
            }
        
        }
    
    }
    else {
        const {name,id, address} = props;
        device = await ble.connectDevice( {name,id,address}, 5000 )
        console.log( 'connected to ',{name:device.name, id:device.id, address:device.address,profile:device.getProfile() })
        device.on('data', (data)=> {
            console.log( 'device:',device.name,'data:', data)
        })
        if (!device)
        process.exit();
    
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

