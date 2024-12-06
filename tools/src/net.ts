import { NetworkInterfaceInfo, networkInterfaces } from "os"

/**
 * Retrieves the IPv4 address of the first non-internal network interface.
 * 
 * @returns {string} The IPv4 address of the first non-internal network interface.
 */
export const getAddress  = ():NetworkInterfaceInfo => {
    const nets = networkInterfaces()
    const keys = Object.keys(nets)
    const found:NetworkInterfaceInfo[] = []
    
    keys.forEach( key => {
        const ni = nets[key].filter( n => n.family === 'IPv4' && !n.internal)[0]
        if (ni)
            found.push(ni)
    })
    
    return found [0]
    
}
