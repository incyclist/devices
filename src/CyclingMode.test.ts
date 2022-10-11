import {CyclingModeBase} from "./CyclingMode";
import {DeviceAdapter} from "./Device";
import { EventLogger } from "gd-eventlog";

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

const mockAdapter: DeviceAdapter = {
    isBike: jest.fn(() => true),
    isPower: jest.fn(() => true),
    isHrm: jest.fn(() => true),
    getID: jest.fn(() => 'Mock'),
    getDisplayName: jest.fn(() => 'Mock'),
    getName: jest.fn(() => 'Mock'),
    getPort: jest.fn(() => 'MockPort'),
    getProtocol: jest.fn(),
    getProtocolName: jest.fn(() => 'MockPort'),
    setIgnoreHrm: jest.fn(),
    setIgnorePower: jest.fn(),
    setIgnoreBike: jest.fn(),
    select: jest.fn(),
    unselect: jest.fn(),
    isSelected: jest.fn(),
    setDetected: jest.fn(),
    isDetected: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    sendUpdate: jest.fn(),
    onData: jest.fn(),
    isSame: jest.fn()
}

describe( 'CyclingMode',()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined)

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
        test( 'adapter is null',()=>{
            expect( ()=>{new CyclingModeBase(null)}).toThrowError( 'IllegalArgument: adapter is null' );
        })


    })

})
