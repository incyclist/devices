import {CyclingModeBase} from "./cycling-mode";
import { EventLogger } from "gd-eventlog";
import { MockLogger } from "../../test/logger";
import MockAdapter from "../../test/mock-adapter";


if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

const mockAdapter  =  new MockAdapter()

describe( 'CyclingMode',()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( MockLogger)

    })

    describe ( 'constructor()',()=>{
        test( 'only adapter provided',()=>{
            const cyclingMode = new CyclingModeBase(mockAdapter);
            
            expect( cyclingMode.adapter ).toBe( mockAdapter );
            expect( cyclingMode.settings ).toEqual({});
        } );

        test( 'with adapter and settings',()=>{
            const cyclingMode = new CyclingModeBase(mockAdapter, { test:true });
            
            expect( cyclingMode.adapter ).toBe( mockAdapter );
            expect( cyclingMode.settings['test'] ).toBeTruthy();
        } );


    })

})
