import {main as wahoo} from './wahoo'
import {main as bkool} from './bkool'

const parseArgs = ()=> {
    const args = process.argv.slice(2);
    const profile = args[0]
    return {profile}
}



const main = async ({profile}) => {




    if (profile==='wahoo') {
        console.log('wahoo simulator')
        wahoo()
    }
    else if (profile==='bkool') {
        console.log('bkool simulator')
        bkool()
    }
    else {
        console.log ( 'usage: ble-simulator <profile> [--random]')
    }


}

main( parseArgs() )

