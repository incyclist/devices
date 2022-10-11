import { EventLogger } from 'gd-eventlog';
import DaumClassicAdapter from './DaumClassicAdapter';
import DaumClassicProtocol from './DaumClassicProtocol';
import BikeInterface from './bike'

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();
describe( 'DaumClassicAdapter', ()=>{
    beforeAll( ()=> {
        if (process.env.DEBUG!==undefined && process.env.DEBUG!=='' && Boolean(process.env.DEBUG)!==false)
            EventLogger.useExternalLogger ( { log: (str)=>console.log(str), logEvent:(event)=>console.log(event) } )
        jest.useFakeTimers();
    })

    afterAll( ()=> {
        EventLogger.useExternalLogger ( undefined)
        jest.useRealTimers();
    })

    describe('check',()=>{
        let a: DaumClassicAdapter;
        let initData: any;
        let bikeComms: any
        beforeEach( ()=>{
            bikeComms = { 
                getPort: jest.fn( ()=>'COMX'),
            }
            initData = DaumClassicAdapter.prototype.initData;    
            DaumClassicAdapter.prototype.initData =  jest.fn()
            a = new DaumClassicAdapter( new DaumClassicProtocol(),bikeComms);
        })
        afterEach( ()=>{
            DaumClassicAdapter.prototype.initData =  initData
        })


        test('positive flow',async ()=>{
            bikeComms.isConnected = jest.fn( ()=>true)
            bikeComms.saveConnect = jest.fn( ()=>Promise.reject(new Error('some error')))
            bikeComms.getAddress = jest.fn( ()=>({bike:0}))
            bikeComms.getVersion = jest.fn( ()=>({serialNo:4711,cockpit:'8008'}))
            const res = await a.check();
            expect(bikeComms.saveConnect).not.toHaveBeenCalled()
            expect(bikeComms.getAddress).toHaveBeenCalled()
            expect(bikeComms.getVersion).toHaveBeenCalled()
            expect(res).toMatchObject({bikeNo:0,serialNo:4711,cockpit:'8008'});
            expect(a.getName()).toBe('Daum 8008')
            expect(a.getID()).toBe(4711)
            
        })
        test('not connected: will connect',async ()=>{
            bikeComms.isConnected = jest.fn( ()=>false)
            bikeComms.saveConnect = jest.fn( ()=>Promise.resolve(true))
            bikeComms.getAddress = jest.fn( ()=>({bike:0}))
            bikeComms.getVersion = jest.fn( ()=>({serialNo:4711,cockpit:'8008'}))
            const res = await a.check();
            expect(res).toMatchObject({bikeNo:0,serialNo:4711,cockpit:'8008'});
            expect(a.getName()).toBe('Daum 8008')
            expect(a.getID()).toBe(4711)
        })
        test('not connected, connection attempt fails: throws error',async ()=>{
            bikeComms.isConnected = jest.fn( ()=>false)
            bikeComms.saveConnect = jest.fn( ()=>Promise.reject(new Error('some error')))
            bikeComms.getAddress = jest.fn( ()=>({bike:0}))
            bikeComms.getVersion = jest.fn( ()=>({serialNo:4711,cockpit:'8008'}))
            try {
                await a.check();
                fail('should have thrown an error')
            } catch (e) {
                expect(e.message).toBe('some error')
            }
            

        })
        test('getAddress fails',async ()=>{
            bikeComms.isConnected = jest.fn( ()=>true)
            bikeComms.getAddress = jest.fn( ()=>Promise.reject(new Error('getAddress:some error')))
            bikeComms.getVersion = jest.fn( ()=>({serialNo:4711,cockpit:'8008'}))
            try {
                await a.check();
                fail('should have thrown an error')
            } catch (e) {
                expect(e.message).toBe('getAddress:some error')
            }

        })
        test('getVersion fails',async ()=>{
            bikeComms.isConnected = jest.fn( ()=>true)
            bikeComms.getAddress = jest.fn( ()=>({bike:0}))
            bikeComms.getVersion = jest.fn( ()=>Promise.reject(new Error('getVersion:some error')))
            try {
                await a.check();
                fail('should have thrown an error')
            } catch (e) {
                expect(e.message).toBe('getVersion:some error')
            }

        })
        test('one of the promises does not resolve/reject',async ()=>{
            bikeComms.isConnected = jest.fn( ()=>true)
            bikeComms.getAddress = jest.fn( ()=>({bike:0}))
            bikeComms.getVersion = jest.fn( ()=> new Promise(()=>{}) )

            const fn = ()=> {
                let res = a.check().catch( (err)=> {throw (err)})
                jest.advanceTimersByTime(6000)
                return res;
            }


            try {
                await fn()
            } catch (e) {
                expect(e.message).toBe('timeout')
            }

        },10000)

    })


    describe('getCurrentBikeData',()=>{
        let a: DaumClassicAdapter;
        let initData: any;
        let bikeComms: any
        beforeEach( ()=>{
            bikeComms = { 
                getPort: jest.fn( ()=>'COMX'),
            }
            initData = DaumClassicAdapter.prototype.initData;    
            DaumClassicAdapter.prototype.initData =  jest.fn()
            a = new DaumClassicAdapter( new DaumClassicProtocol(),bikeComms);
        })
        afterEach( ()=>{
            DaumClassicAdapter.prototype.initData =  initData
        })

        test('mormal flow: does not check connection',async ()=> {
            bikeComms.isConnected = jest.fn( ()=>true)
            bikeComms.runData = jest.fn( ()=>({gear:10, power:100, speed:30}))
            const res = await a.getCurrentBikeData()
            expect(res).toMatchObject({gear:10, power:100, speed:30})
            expect(bikeComms.isConnected).not.toHaveBeenCalled()

        })
        test('not connected: will not be checked',async ()=> {
            bikeComms.isConnected = jest.fn( ()=>false)
            bikeComms.runData = jest.fn( ()=>({gear:10, power:100, speed:30}))
            await a.getCurrentBikeData()
            expect(bikeComms.isConnected).not.toHaveBeenCalled()
            expect(bikeComms.runData).toHaveBeenCalled()

        })

        test('error in getCurrentBikeData',async ()=> {
            bikeComms.isConnected = jest.fn( ()=>false)
            bikeComms.runData = jest.fn( ()=> Promise.reject(new Error('some error')))
            try {
                await a.getCurrentBikeData()
                fail('should have thrown an error')
            } catch (e) {
                expect(e.message).toBe('some error')
            }

        })

        test('getCurrentBikeData does not resolve/reject promise: does not timeout',async ()=> {
            bikeComms.isConnected = jest.fn( ()=>false)
            bikeComms.runData = jest.fn( ()=> new Promise(()=>{}) )
            
            let error;
            const fn = ()=> {
                a.getCurrentBikeData().catch( (err)=> {throw (err)})
                jest.advanceTimersByTime(6000)

                expect(error).toBeUndefined()
                return Promise.resolve()
            }


            try {
                await fn()
            } catch (e) {
                error = e;
            }

        })

    })



    describe('sendRequest',()=>{
        let a: DaumClassicAdapter;
        let bikeComms:any;
    
        beforeEach( async ()=>{
            bikeComms = new BikeInterface({port:'COMX'})   
            bikeComms.setSlope = jest.fn( (slope,bike=0)=>({bike,slope}))
            bikeComms.setPower = jest.fn( (power,bike=0)=>({bike,power}));
            a = new DaumClassicAdapter( new DaumClassicProtocol(),bikeComms);
        })

        test('slope has been set',async ()=>{
            const res = await a.sendRequest({slope:10})
            expect(bikeComms.setSlope).toHaveBeenCalledWith(10)
            expect(bikeComms.setPower).not.toHaveBeenCalled()
            expect(res).toEqual({slope:10})
        })
        test('power has been set',async ()=>{
            const res = await a.sendRequest({targetPower:100})
            expect(bikeComms.setSlope).not.toHaveBeenCalled()
            expect(bikeComms.setPower).toHaveBeenCalledWith(100)
            expect(res).toEqual({targetPower:100})
        })
        test('power and slope ',async ()=>{
            const res= await a.sendRequest({slope:10,targetPower:100})
            expect(bikeComms.setSlope).toHaveBeenCalledWith(10)
            expect(bikeComms.setPower).toHaveBeenCalledWith(100)
            expect(res).toEqual({slope:10,targetPower:100})
        })
        test('no request ',async ()=>{
            const res = await a.sendRequest({})
            expect(bikeComms.setSlope).not.toHaveBeenCalled()
            expect(bikeComms.setPower).not.toHaveBeenCalled()
            expect(res).toEqual({})
        })
        test('error when sending command',async ()=>{
            bikeComms.setSlope = jest.fn( ()=>{throw new Error('some error')})            
            // eslint-disable-next-line no-throw-literal
            bikeComms.setPower = jest.fn( ()=>{throw 'power error'})
            a.logger.logEvent  = jest.fn()
            const res = await a.sendRequest({slope:10})
            expect(res).toBeUndefined()
            expect(a.logger.logEvent).toHaveBeenCalledWith(expect.objectContaining({message:'sendRequest error',error:'some error'}))

            
            await a.sendRequest({targetPower:100})            
            expect(a.logger.logEvent).toHaveBeenLastCalledWith(expect.objectContaining({message:'sendRequest error',error:'power error'}))

        })

    })

})