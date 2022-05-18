import SimulatorProtocol,{Simulator} from "./Simulator";

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

describe('Simulator',() => {

    describe('Constructor',()=> {

        test('empty constructor',() => {
            let s = new Simulator();
            expect(s).toMatchObject( { speed:0, power:0, cadence: 90, slope:0 })
            expect(s).toMatchObject( { detected:false, selected:false })
            expect(s.started).toBe(false)
            expect(s.paused).toBe(false)
            expect(s.time).toBeUndefined()
            expect(s.iv).toBeUndefined()
            expect(s.getProtocolName()).toBe(SimulatorProtocol.NAME)
            
        }) 


    });

    test('isBike',()=> {
        let s = new Simulator();
        expect(s.isBike()).toBe(true)
    })

    test('isHrm',()=> {
        let s = new Simulator();
        expect(s.isHrm()).toBe(false)
    })

    test('isPower',()=> {
        let s = new Simulator();
        expect(s.isPower()).toBe(true)
    })


    test('getID',()=> {
        let s = new Simulator();
        expect(s.getID()).toBe(Simulator.NAME)
    })

    test('getName',()=> {
        let s = new Simulator();
        expect(s.getName()).toBe(Simulator.NAME)
    })

    test('getPort',()=> {
        let s = new Simulator();
        expect(s.getPort()).toBe('local')
    })

    describe('start',()=> {

        let s;
        beforeEach( ()=> {
            s = new Simulator();
        })
        afterEach( ()=>{
            s.stop();
        })

        test('promise: normal start',async () => {
            const res = await s.start();

            expect(res.error).toBeUndefined();
            expect(s.iv).toBeDefined();
            expect(s.started).toBe(true)
            expect(s.paused).toBe(false)
        }) 

        test('promise: repetative start',async () => {
            await s.start();
            const iv = s.iv;
            const res = s.start();

            expect(res.error).toBeUndefined();
            expect(s.iv).toEqual(iv);
            expect(s.started).toBe(true)
            expect(s.paused).toBe(false)
        }) 

        test('edge case: repetative start, started has been ste to false',async () => {
            await s.start();
            s.started = false;
            const iv = s.iv;
            const res = s.start();

            expect(res.error).toBeUndefined();
            expect(s.iv).not.toEqual(iv);
            expect(s.started).toBe(true)
            expect(s.paused).toBe(false)
        }) 


        test('callback: normal start',() => {

            s.start( res => {
                expect(res.error).toBeUndefined();
                expect(s.iv).toBeDefined();
                expect(s.started).toBe(true)
                expect(s.paused).toBe(true)    
            })

        }) 

        test('callback: repetative start',async () => {
            await s.start();
            const iv = s.iv;
            s.start( res => {
                expect(res.error).toBeUndefined();
                expect(s.iv).toEqual(iv);
                expect(s.started).toBe(true)
                expect(s.paused).toBe(true)    
            })
        }) 


    });

    describe('pause',()=> {

        let s;
        beforeEach( ()=> {
            s = new Simulator();
            
        })

        test('Simulator is not paused before',async () => {
            s.started = true;
            s.paused = false;
            const res = await s.pause();
            expect(res).toBe(true)
            expect(s.paused).toBe(true)
        }) 

        test('Simulator is already before',async () => {
            s.started = true;
            s.paused = true;
            const res = await s.pause();
            expect(res).toBe(true)
            expect(s.paused).toBe(true)
        }) 
        test('Simulator is not started',async () => {
            s.paused = false;
            s.started = false;
            let error = undefined;
            try {
                const res = await s.pause();                
            }
            catch (err) {
                error = err;
            }            
            expect(error).toBeDefined();
            expect(s.paused).toBe(false)
        }) 

    });


    describe('resume',()=> {

        let s;
        beforeEach( ()=> {
            s = new Simulator();
            
        })

        test('Simulator is not paused',async () => {
            s.started = true;
            s.paused = false;
            const res = await s.resume();
            expect(res).toBe(true)
            expect(s.paused).toBe(false)
        }) 

        test('Simulator is paused ',async () => {
            s.started = true;
            s.paused = true;
            const res = await s.resume();
            expect(res).toBe(true)
            expect(s.paused).toBe(false)
        }) 
        test('Simulator is not started',async () => {
            s.paused = false;
            s.started = false;
            let error = undefined;
            try {
                await s.resume();                
            }
            catch (err) {
                error = err;
            }            
            expect(error).toBeDefined();
            expect(s.paused).toBe(false)
        }) 

    });

    describe('sendUpdate',()=> {

        let s;
        beforeEach( ()=> {
            s = new Simulator();
            
        })

        test('refresh - no limits set before',() => {
            const res = s.sendUpdate({refresh:true});
            expect(res).toEqual({})
        }) 

        test('refresh - limits have been set before',() => {
            s.sendUpdate({ targetPower:100 });
            
            const res = s.sendUpdate({refresh:true});
            expect(res).toEqual({ targetPower:100 })
        }) 

        test('refresh and limits - limits have been set before',() => {
            s.sendUpdate({ targetPower:100 });
            const res = s.sendUpdate({refresh:true,targetPower:200});
            expect(res).toEqual({ targetPower:200 })
        }) 

        test('new limits - limits have been set before',() => {
            s.sendUpdate( { minPower:100, maxPower:200 });
            const res = s.sendUpdate({targetPower:200});
            expect(res).toEqual({ targetPower:200 })
        }) 


    });

    describe('onData',()=> {

        let s;
        beforeEach( ()=> {
            s = new Simulator();
            
        })

        test('setting once',async () => {
            const onData = jest.fn();
            s.onData(onData);
            s.update()
            expect(onData).toBeCalled();
        }) 

        test('setting twice',async () => {
            const onData1 = jest.fn();
            const onData2 = jest.fn();
            s.onData(onData1);
            s.update()
            expect(onData1).toBeCalled();
            expect(onData2).not.toBeCalled();
            onData1.mockReset();

            s.onData(onData2);
            s.update()
            expect(onData1).not.toBeCalled();
            expect(onData2).toBeCalled();
        }) 

    });

});
