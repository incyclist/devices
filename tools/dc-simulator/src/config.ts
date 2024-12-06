import fs from 'fs/promises'
import { getAddress } from './net'
import { hostname } from 'os'
import { beautifyUUID } from '../../../lib'

const createRawText = (txt) => {
    const buffer = Buffer.from(txt,'utf8')
    return buffer
}

export const prepareConfig = async (file,name,uuids) => {

    //import net from 'net'
    const config = await fs.readFile(file,'utf8')

    const json = JSON.parse(config)
    const target = JSON.parse(JSON.stringify(json))


    const {address,mac} = getAddress()
    target.addresses = [address]
    target.referer.address = address
    target.txt['mac-address'] = mac.toUpperCase().replace(/:/g,'-')
    target.host = `${hostname()}.local`
    target.name = name
    target.fqdn = `${name}._wahoo-fitness-tnp._tcp.local`

    target.txt['ble-service-uuids'] = uuids.map(s => beautifyUUID(s,true)).join(',')
    
    console.log(config, "\n", target    )


    target.rawTxt = []
    const keys = Object.keys(target.txt)
    keys.forEach( (key) => {
        const txt = `${key}=${target.txt[key]}`
        target.rawTxt.push(createRawText(txt))
    })
    
    return target
}