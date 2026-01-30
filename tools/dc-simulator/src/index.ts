import { parseConfig } from "./config.js"
import {createServer} from 'node:net'
import { Bonjour } from 'bonjour-service'
import { DirectConnectComms } from './comms.js'
import { getAddresses } from "./net.js"
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
    let currentPower = 0
    let randomPower = true
    let simulateGlitch = false
    let isEmulatorStarted = false
    let iv

    const {config, emulator} = await parseConfig(configFile)

    const serverCallbacks = (socket) => {//#endregion
        const services = emulator.getServices()
        return new DirectConnectComms(socket,services)
    }

    const start = (a,p) => {
        console.log('start',a,p)
        const server = createServer( serverCallbacks);

        if (!isEmulatorStarted) {
            console.log('start emulator')
            emulator.start()
            isEmulatorStarted = true;
            setTimeout(simulate,3000)
        }

        server.on('error',  (err) => { console.log('ERROR',err)})
        server.on('connection',  (conn) => { console.log('CONNECTION',conn.address())})
        server.on('listening',  () => { console.log(`listening on ${a}:${p}`) })
            
        server.listen( p,a);
    
    }

    const simulate = () => {   
        if (iv)
            return
        iv = setInterval(() => {
            console.log('sending update ...')
            if (paused)
                emulator.pause()
            else if  (simulateGlitch) {
                emulator.update({power:20, heartrate:Math.round(Math.random()*40+80), cadence:1})   
                simulateGlitch = false
            }
            else {
                const power = randomPower ? Math.round(Math.random()*100+50) : currentPower
                emulator.update({power, heartrate:Math.round(Math.random()*40+80), cadence:currentCadence})
            }
        }, 1000)        
    }

    //start(address,port)
    getAddresses().forEach( n => {
        start(n.address,config.port)
    })

    const instance = new Bonjour()
    instance.publish( config)

    listenKeyPresses( (key,event)=>{
        if (key === '0')  {
            currentCadence = 0
            currentPower = 0
            console.log( '\rSTOPPED PEDALLING')
        }
        if (key === 'p')  {
            paused = true
            console.log( '\rPAUSED')
        }
        if (key === 'g')  {
            simulateGlitch = true
            console.log( '\rSIMULATE GLITCH')
        }
        else if (key === 'r')  {

            paused = false
            emulator.resume()

            console.log( '\rRESUMED')
        }
        else if (key === '#')  {            
            randomPower = !randomPower
            console.log('\rrandomPower',randomPower ? 'ON' : 'OFF')
        }
        else if (key==='+' && !randomPower) {
            currentPower += 5
            console.log('\rcurrentPower',currentPower)
        }
        else if (key==='-' && !randomPower) {
            currentPower = currentPower- 5
            if (currentPower<0)
                currentPower = 0
            console.log('\rcurrentPower',currentPower)    
        }
        else if (event.name==='left' || key==='2') {
            currentCadence  = event.shift ? Math.max(0,currentCadence-20) : Math.max(0,currentCadence-5)
            console.log('\rcurrentCadence',currentCadence)    

        }
        else if (event.name==='right' || key==='8') {
            currentCadence  = event.shift ? Math.max(0,currentCadence+20) : Math.max(0,currentCadence+5)
            console.log('\rcurrentCadence',currentCadence)    
        }
        
    })




}

const parseArgs = ()=> {
    const args = process.argv.slice(2);
    const configFile = args[0]
    return {configFile}
}


main( parseArgs() )