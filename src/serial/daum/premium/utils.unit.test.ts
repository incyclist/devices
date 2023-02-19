import {hexstr,ascii,getAsciiArrayFromStr, buildMessage, parseTrainingData, routeToEpp, FileTimeSupport} from './utils'
import { Route } from '../../../types/route';
import FileTime from 'win32filetime';


describe ( 'hexstr' ,()=> {

    test( 'should return hex values of elements in array',() => {
        const arr = [0x00,0x10,0x20,0x00];
        const res = hexstr(arr);
        expect(res).toBe('00 10 20 00')
    })

    test( 'should return hex values of elements in array',() => {
        const res = hexstr('A00');
        expect(res).toBe('41 30 30')
    })

    test( 'should return hex values of selected elements in array, when start is provided',() => {
        const arr = [0x00,0x10,0x20,0x00];
        const res = hexstr(arr,1);
        expect(res).toBe('10 20 00')
    })

    test( 'should return hex values of selected elements in array, when start and length are provided',() => {
        const arr = [0x00,0x10,0x20,0x00];
        const res = hexstr(arr,1,2);
        expect(res).toBe('10 20')
    })

    test( 'should return empty string if arr is undefined',() => {
        const res = hexstr(undefined);
        expect(res).toBe('')
    })

    test( 'should return empty string if arr is null',() => {
        const res = hexstr(null);
        expect(res).toBe('')
    })

    test( 'should return empty string if start is bigger then length of array',() => {
        const arr = [0x00,0x10,0x20,0x00];
        const res = hexstr(arr,10);
        expect(res).toBe('')
    })

    test( 'should concatenate at end of arrray if start and len are provided is bigger then length of array',() => {
        const arr = [0x00,0x10,0x20,0x00];
        const res = hexstr(arr,2,10);
        expect(res).toBe('20 00')
    })

})


describe ( 'ascii', ()=> {
    test( 'should provide ascii value of character',() => {

        expect( ascii('A') ).toBe(65) // 0x41
        expect( ascii('Z') ).toBe(90) // 0x5A
        expect( ascii('!') ).toBe(33) // 0x21

    });

    test( 'should provide ascii value of number characters',() => {

        expect( ascii('0') ).toBe(0x30) 
        expect( ascii('1') ).toBe(0x31) 
        expect( ascii('2') ).toBe(0x32) 
        expect( ascii('3') ).toBe(0x33) 
        expect( ascii('4') ).toBe(0x34) 
        expect( ascii('5') ).toBe(0x35) 
        expect( ascii('6') ).toBe(0x36) 
        expect( ascii('7') ).toBe(0x37) 
        expect( ascii('8') ).toBe(0x38) 
        expect( ascii('9') ).toBe(0x39) 

    });

    test( 'should return undefined is character is missing',() => {

        expect( ascii(undefined) ).toBeUndefined()
        
    });

})

describe ( 'getAsciiArrayFromStr', ()=> {
    test( 'should provide ascii value of character',() => {

        expect( getAsciiArrayFromStr('AZ!') ).toEqual([65,90,33])

    });

    test( 'should return undefined is character is missing',() => {
        expect( getAsciiArrayFromStr(undefined) ).toBeUndefined();
        expect( getAsciiArrayFromStr(null) ).toBeUndefined();
        
    });

    test( 'should return empty array is string is empty',() => {

        expect( getAsciiArrayFromStr('') ).toEqual([])
        
    });

})


describe ( 'buildMessage',()=> {
    test ('array with numbers',()=> {
        const res = buildMessage('M72',[0])
        expect( hexstr(res) ).toBe('01 4d 37 32 00 38 32 17')
    })

    test ('number',()=> {
        const res = buildMessage('M72',0)
        expect( hexstr(res) ).toBe('01 4d 37 32 00 38 32 17')
    })

    test ('string',()=> {
        const res = buildMessage('M72','0')
        expect( hexstr(res) ).toBe('01 4d 37 32 30 33 30 17')
    })

    test ('empty string',()=> {
        const res = buildMessage('M72','')
        expect( hexstr(res) ).toBe('01 4d 37 32 38 32 17')
    })

    test ('undefined',()=> {
        const res = buildMessage('M72')
        expect( hexstr(res) ).toBe('01 4d 37 32 38 32 17')
    })

})

describe( 'parseTrainingData',()=> {

    test( 'sample data',()=> {
        const GS =  String.fromCharCode(0x1D)

        let payload:string = ''
        payload = payload+'10'+GS
        payload = payload+'99'+GS
        payload = payload+'10.0'+GS
        payload = payload+'-3.3'+GS
        payload = payload+'150'+GS
        payload = payload+'90.1'+GS
        payload = payload+'130'+GS
        payload = payload+'130.2'+GS
        payload = payload+'130.3'+GS
        payload = payload+'13.1'+GS
        payload = payload+'11'+GS
        payload = payload+'1'+GS
        payload = payload+'0'
        
        const res = parseTrainingData(payload);
        expect(res).toEqual( {time:10, heartrate:99, speed:36, slope:-3.3, distanceInternal:150, cadence:90.1, power:130, physEnergy:130.2, realEnergy:130.3, torque:13.1, gear:10, deviceState:1, speedStatus:'ok'})
    })

});

describe( 'routeToEpp',()=>{
    const route:Route = {
        programId: 1,
        points: [{distance:0,elevation:1},{distance:10,elevation:10},{distance:20,elevation:20},{distance:30,elevation:30},{distance:40,elevation:40},{distance:50,elevation:50}],
        type: 'xyz',
        name: 'test',
        
        lapMode: false,
        totalDistance: 100,
        minElevation: 1,
        maxElevation: 50            
    }

    test('valid route',()=>{


        let res;
        let testRoute;
        const date = new Date(2022,0,1,15,0,0,0)

        testRoute = Object.assign({},route)
        res = routeToEpp(testRoute, date)
        expect( Buffer.from(res).toString('hex')).toMatchSnapshot()

        testRoute = Object.assign({},route)
        delete testRoute.name
        res = routeToEpp(testRoute,date)
        expect( Buffer.from(res).toString('hex')).toMatchSnapshot()


        testRoute = Object.assign({},route)
        delete testRoute.minElevation
        res = routeToEpp(testRoute,date)
        expect( Buffer.from(res).toString('hex')).toMatchSnapshot()

        testRoute = Object.assign({},route)
        delete testRoute.maxElevation
        res = routeToEpp(testRoute,date)
        expect( Buffer.from(res).toString('hex')).toMatchSnapshot()

        testRoute = Object.assign({},route)
        testRoute.points=[]
        delete testRoute.minElevation
        delete testRoute.maxElevation
        res = routeToEpp(testRoute,date)
        expect( Buffer.from(res).toString('hex')).toMatchSnapshot()

    })

    describe('no date provided',()=>{
        let f1,f2;
        beforeAll(()=>{
            f1 = FileTimeSupport.fromCurrentDate
            f2 = FileTimeSupport.fromDate
            FileTimeSupport.fromCurrentDate = jest.fn().mockReturnValue( FileTime.fromUnix(new Date(2022,0,1,15,0,0,0)))
            FileTimeSupport.fromDate = jest.fn( (date) =>  FileTime.fromUnix(date))
        })

        test('with route',()=>{
            let testRoute;
    
            testRoute = Object.assign({},route)
            const res = routeToEpp(testRoute)
            expect( Buffer.from(res).toString('hex')).toMatchSnapshot()
            expect( FileTimeSupport.fromCurrentDate).toHaveBeenCalled()
    
        })

        afterAll( ()=>{
            FileTimeSupport.fromCurrentDate = f1
            FileTimeSupport.fromDate = f2
        })
        
    })

})