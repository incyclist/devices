import {main as wahoo} from './wahoo'

const parseArgs = ()=> {
    const args = process.argv.slice(2);
    const profile = args[0]
    return {profile}
}



const main = async ({profile}) => {


    if (profile==='wahoo') {
        wahoo()
    }

}

main( parseArgs() )

