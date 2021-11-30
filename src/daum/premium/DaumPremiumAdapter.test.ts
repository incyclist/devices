import { EventLogger } from 'gd-eventlog';

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

describe.skip( 'DaumPremiumAdapter', ()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined)

    })

    describe('check',()=>{
        test('a',()=>{})
    })
    describe('start',()=>{})
    describe('updateData',()=>{})
    describe('getCurrentBikeData',()=>{})
})