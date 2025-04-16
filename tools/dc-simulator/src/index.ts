import { parseConfig } from "./config"
import {createServer} from 'net'
import { Bonjour } from 'bonjour-service'
import { DirectConnectComms } from './comms'
import { getAddresses } from "./net"
import readline from "readline/promises"


const listenKeyPresses = (onKeyPress) => {

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  
    process.stdin.on("keypress", onKeyPress);
    return rl;
  };

const main = async ({configFile = './config/smarttrainer.json'}) => {

    console.log('configFile',configFile)

    let paused = false
    let currentCadence = 90

    const {config, emulator} = await parseConfig(configFile)

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
            if (paused)
                emulator.pause()
            else 
                emulator.update({power:Math.round(Math.random()*100+50), heartrate:Math.round(Math.random()*40+80), cadence:currentCadence})
        }, 1000)        
    }

    //start(address,port)
    getAddresses().forEach( n => {
        start(n.address,config.port)
    })

    const instance = new Bonjour()
    instance.publish( config)

    listenKeyPresses( (key,event)=>{
        if (key === 'p')  {
            console.log('### pausing')
            paused = true
        }
        else if (key === 'r')  {
            console.log('### resuming')
            paused = false
            emulator.resume()
        }
        else if (event.name==='left') 
            currentCadence  = event.shift ? Math.max(0,currentCadence-20) : Math.max(0,currentCadence-5)
        else if (event.name==='right') 
            currentCadence  = event.shift ? Math.max(0,currentCadence+20) : Math.max(0,currentCadence+5)
        else 
            console.log('######## KEY PRESS',{key,event})
        
    })




}

const parseArgs = ()=> {
    const args = process.argv.slice(2);
    const configFile = args[0]
    return {configFile}
}


main( parseArgs() )