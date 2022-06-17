const { BleInterface, BleHrmDevice,BleCyclingPowerDevice} = require('incyclist-devices')
const noble = require('noble')

let ble;

const parseArgs = ()=> {
    const args = process.argv.slice(2)
    if ( args.length===0 || args[0]==='scan') { 
        return { command: 'scan' }
    }
    if ( args.length===2 && args[0]==='connect') { 
        const props = { command: 'connect' }
        const device = args[1].split(':')
        if (device[0].toLocaleLowerCase()==='id')
            props.id = device[1]
        else if (device[0].toLocaleLowerCase()==='address')
            props.address = device[1]
        else if (device[0].toLocaleLowerCase()==='name')
            props.name = device[1]
        else 
            props.name = args[1];
        return props
    }
    if ( args[0]!=='scan') {
        console.log('Usage: node index.js <command>')
        console.log('Commands:')
        console.log('  scan')
        console.log('  connect [id:device id|name:device name|address:device address]')
    }

    return 
}

const  main = async(props = {})=> {

    console.log('Device Types:', BleInterface.deviceClasses)
    
    ble = new BleInterface()
    ble.setBinding(noble)
    await ble.connect();

    let device
    if ( !props.command || props.command==='scan') {
        let devices = [];
        devices = await ble.scan( { deviceTypes:[BleHrmDevice,BleCyclingPowerDevice]} );
        if (devices.length===0) {
            await ble.disconnect();
            process.exit()
        }    
        
        devices.forEach(device => { 
            device.connect()
            device.on('data', (data)=> {
                console.log( 'device:',device.name,'data:', data)
            })
        
        })
    
    }
    else {
        device = await this.ble.connectDevice( this )
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
