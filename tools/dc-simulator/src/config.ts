import fs from 'fs/promises'
import { getAddress } from './net'
import { hostname } from 'os'
import { beautifyUUID } from 'incyclist-devices'
import { Emulator, EmulatorOptions } from './emulator'

const createRawText = (txt) => {
    const buffer = Buffer.from(txt,'utf8')
    return buffer
}

export const parseConfig = async (file:string) => {
  

    //import net from 'net'
    const config = await fs.readFile(file,'utf8')

    const json = JSON.parse(config)
    const target = JSON.parse(JSON.stringify(json))
    const name = target.name

    const {address,mac} = getAddress()
    target.addresses = [address]
    target.referer.address = address
    target.txt['mac-address'] = mac.toUpperCase().replace(/:/g,'-')
    target.host = `${hostname()}.local`
    target.fqdn = `${name}._wahoo-fitness-tnp._tcp.local`

    //target.txt['ble-service-uuids'] = uuids.map(s => beautifyUUID(s,true)).join(',')

    const uuids = target.txt['ble-service-uuids'].split(',').map( s => beautifyUUID(s))

    console.log(config, "\n", target    )


    target.rawTxt = []
    const keys = Object.keys(target.txt)
    keys.forEach( (key) => {
        const txt = `${key}=${target.txt[key]}`
        target.rawTxt.push(createRawText(txt))
    })


    const props:Partial<EmulatorOptions> = {
    }
    if (target.frequency) {
        props.frequency = target.frequency
        delete target.frequency
    }
    
    
    const emulator= new Emulator({...props,name,uuids})

    return {config:target,emulator}
}