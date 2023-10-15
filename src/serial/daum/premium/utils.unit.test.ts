import { Route } from './types'
import {hexstr,ascii,getAsciiArrayFromStr, buildMessage, parseTrainingData, routeToEpp, FileTimeSupport, bin2esc, esc2bin, responseLog} from './utils'

describe('utils',()=>{

    describe('bin2esc',()=>{

        const v=(s:string):Uint8Array => Uint8Array.from( Buffer.from(s,'hex') )

        test('escapes 0x01 to 0x22,0x01',()=>{
            const res = bin2esc( v('000100'))
            expect(Buffer.from(res).toString('hex')).toBe('00221100')           

            const res1 = bin2esc( Uint8Array.from([1,1,0,1,0]))
            expect(Buffer.from(res1).toString('hex')).toBe('2211221100221100')           
        })
        test('escapes 0x12 to 0x22,0x12',()=>{
            const res = bin2esc( Uint8Array.from([0,0x12,0]))
            expect(Buffer.from(res).toString('hex')).toBe('00221200')           

            const res1 = bin2esc( Uint8Array.from([0x12,0x12,0,0x12,0]))
            expect(Buffer.from(res1).toString('hex')).toBe('2212221200221200')           
        })
        test('escapes 0x22 to 0x22,0x22',()=>{
            const res = bin2esc( Uint8Array.from([0,0x22,0]))
            expect(Buffer.from(res).toString('hex')).toBe('00222200')           

            const res1 = bin2esc( Uint8Array.from([0x22,0x22,0,0x22,0]))
            expect(Buffer.from(res1).toString('hex')).toBe('2222222200222200')           
        })
        test('escapes 0x17 to 0x22,0x27',()=>{
            const res = bin2esc( Uint8Array.from([0,0x17,0]))
            expect(Buffer.from(res).toString('hex')).toBe('00222700')           

            const res1 = bin2esc( Uint8Array.from([0x17,0x17,0,0x17,0]))
            expect(Buffer.from(res1).toString('hex')).toBe('2227222700222700')           
        })
        test('escapes 0x06 to 0x22,0x16',()=>{
            const res = bin2esc( Uint8Array.from([0,0x06,0]))
            expect(Buffer.from(res).toString('hex')).toBe('00221600')           

            const res1 = bin2esc( Uint8Array.from([0x06,0x17,0,0x17,0]))
            expect(Buffer.from(res1).toString('hex')).toBe('2216222700222700')           
        })
        test('escapes 0x15 to 0x22,0x25',()=>{
            const res = bin2esc( Uint8Array.from([0,0x15,0]))
            expect(Buffer.from(res).toString('hex')).toBe('00222500')           

            const res1 = bin2esc( Uint8Array.from([0x15,0x15,0,0x15,0]))
            expect(Buffer.from(res1).toString('hex')).toBe('2225222500222500')           
        })
    })

    describe('esc2bin',()=>{

        const i=(s:string):Uint8Array => Uint8Array.from( Buffer.from(s.toUpperCase(),'hex') )
        const o=(a:Uint8Array):string => Buffer.from(a).toString('hex').toUpperCase()

        test('escapes 0x22,0x01 to 0x01',()=>{
            const res = esc2bin( i('00221100') )
            expect(o(res)).toBe('000100')           

            const res1 = esc2bin( i('2211221100221100'))
            expect(o(res1)).toBe('0101000100')           
        })
        test('escapes 0x22,0x12 to 0x12',()=>{
            const res = esc2bin( i('00221200') )
            expect(o(res)).toBe('001200')           

            const res1 = esc2bin( i('2212221200221200'))
            expect(o(res1)).toBe('1212001200')           
        })
        test('escapes 0x22,0x22 to 0x22' ,()=>{
            const res = esc2bin( i('00222200') )
            expect(o(res)).toBe('002200')           

            const res1 = esc2bin( i('2222222200222200'))
            expect(o(res1)).toBe('2222002200')           
        })
        test('escapes 0x22,0x27 to 0x17',()=>{
            const res = esc2bin( i('00222700') )
            expect(o(res)).toBe('001700')           

            const res1 = esc2bin( i('2227222700222700'))
            expect(o(res1)).toBe('1717001700')           
        })
        test('escapes 0x22,0x16 to 0x06',()=>{
            const res = esc2bin( i('00221600') )
            expect(o(res)).toBe('000600')           

            const res1 = esc2bin( i('2216221600221600'))
            expect(o(res1)).toBe('0606000600')           
        })
        test('escapes 0x22,0x25 to 0x15',()=>{
            const res = esc2bin( i('00222500') )
            expect(o(res)).toBe('001500')           

            const res1 = esc2bin( i('2225222500222500'))
            expect(o(res1)).toBe('1515001500')           
        })
        test('single 0x22 will be ignored',()=>{
            const res = esc2bin( i('0022AB00') )
            expect(o(res)).toBe('00AB00')           

        })

    })



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
    
    describe( 'responseLog',()=>{
        test( 'no GS',()=> {
            const str = 'some string'
            expect(responseLog(str)).toEqual(str)
        })
        test( 'with GS',()=> {
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

            expect(responseLog(payload)).toEqual('10/99/10.0/-3.3/150/90.1/130/130.2/130.3/13.1/11/1/0')
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
            expect(res).toEqual( {time:10, heartrate:99, speed:36, slope:-3.3, distanceInternal:150, pedalRpm:90.1, power:130, gear:10,isPedalling:true})
        })
    
    });
    
    describe.skip('FileTimeSupport',()=>{
            
        test('from date',()=>{
            const date = new Date(2022,0,1,15,0,0,0)
    
            const ft = FileTimeSupport.fromDate(date)
            expect(ft.high).toBe(30932759)
            expect(ft.low).toBe(3719950336)
        })
    })
    
    describe( 'routeToEpp',()=>{
    
        let ftCurrent;
        let ftDate;
    
        beforeAll( ()=> {
            ftCurrent = FileTimeSupport.fromCurrentDate
            ftDate = FileTimeSupport.fromDate
    
            FileTimeSupport.fromCurrentDate = jest.fn().mockReturnValue( {high:30932759, low:3719950336})
            FileTimeSupport.fromDate = jest.fn().mockReturnValue( {high:30932759, low:3719950336})
        
        })
    
        afterAll( ()=>{
            FileTimeSupport.fromCurrentDate = ftCurrent
            FileTimeSupport.fromDate = ftDate
        })
    
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
})

