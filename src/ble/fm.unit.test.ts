import BleFitnessMachineDevice from './fm';

const data = (input) => {
    const view = new Uint8Array(input.length / 2)

    for (let i = 0; i < input.length; i += 2) {
        view[i / 2] = parseInt(input.substring(i, i + 2), 16)
    }

    return view.buffer
}

describe('BleFitnessMachineDevice',()=>{
    describe('parseIndoorBikeData',()=>{
        let ftms;

        beforeAll( ()=>{
            ftms = new BleFitnessMachineDevice({id:'test'})
        })

        test('distance,cadence,power and time',()=>{
            const res = ftms.parseIndoorBikeData( data('5408e2067e00bb00004d000000'));
            expect(res).toMatchObject( { speed:17.62,instantaneousPower:77,cadence:63,totalDistance:187, time:0 })
        })
        
    })
})
