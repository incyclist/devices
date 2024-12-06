import { prepareConfig } from "./config"
import {createServer} from 'net'
import { Bonjour } from 'bonjour-service'
import { DirectConnectComms } from './comms'
import { Emulator } from "./emulator/emulator"



const main = async ({configFile = './config/kickr-bike.json'}) => {

    const emulator= new Emulator({name:'VOLT 2A34',frequency:1000,disableCps:true})

    const config = await prepareConfig(configFile, emulator.name, emulator.getServices().map(s => s.uuid))
    const {address} = config.referer

    const serverCallbacks = (socket) => {//#endregion
       
        const services = emulator.getServices()

        return new DirectConnectComms(socket,services)
    }




    const start = (a,p) => {
        console.log('start',a,p)
        const server = createServer( serverCallbacks);

        console.log('start emulator')
        emulator.start()

        setTimeout(simulate,3000)
        server.on('error',  (err) => { console.log('ERROR',err)})
        server.on('connection',  (conn) => { console.log('CONNECTION',conn.address())})
        server.on('listening',  () => { console.log(`listening on ${a}:${p}`) })
            
        server.listen( p,a);
    
    }

    const simulate = () => {
    
        setInterval(() => {
            emulator.update({power:Math.round(Math.random()*100+50), heartrate:Math.round(Math.random()*40+80), cadence:Math.round(Math.random()*20+80)})
        }, 1000)
        
    }

    //start(address,port)
    start(address,config.port)

    const instance = new Bonjour()
    instance.publish( config)





    
}

const parseArgs = ()=> {
    const args = process.argv.slice(2);
    const configFile = args[0]
    return {configFile}

}


main( parseArgs() )