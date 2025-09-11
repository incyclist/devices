import {Simulator} from "./Simulator";

if ( process.env.DEBUG===undefined)
    console.log = jest.fn();

describe('Simulator',() => {

    describe('Constructor',()=> {

        test('empty constructor',() => {
            let s = new Simulator({interface:'Simulator'});
            expect(s).toMatchObject( { speed:0, power:0, cadence: 90, slope:0 })
            expect(s.started).toBe(false)
            expect(s.paused).toBe(false)
            expect(s.time).toBeUndefined()
            expect(s.iv).toBeUndefined()
            
        }) 


    });


    test('getID',()=> {
        let s = new Simulator({interface:'Simulator'});
        expect(s.getID()).toBe(Simulator.NAME)
    })

    test('getName',()=> {
        let s = new Simulator({interface:'Simulator'});
        expect(s.getName()).toBe(Simulator.NAME)
    })


    describe('start',()=> {

        let s;
        beforeEach( ()=> {
            s = new Simulator({interface:'Simulator'});
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
            s = new Simulator({interface:'Simulator'});
            
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
            
            await s.pause();                
            
            expect(s.paused).toBe(true)
        }) 

    });


    describe('resume',()=> {

        let s;
        beforeEach( ()=> {
            s = new Simulator({interface:'Simulator'});
            
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
            s.paused = true;
            s.started = false;
            await s.resume();                
            expect(s.paused).toBe(false)
        }) 

    });

    describe('sendUpdate',()=> {

        let s;
        beforeEach( ()=> {
            s = new Simulator({interface:'Simulator'});
            
        })

        test('refresh - no limits set before',async () => {
            const res = await s.sendUpdate({refresh:true});
            expect(res).toEqual({})
        }) 

        test('refresh - limits have been set before',async () => {
            s.sendUpdate({ targetPower:100 });
            
            const res = await s.sendUpdate({refresh:true});
            expect(res).toEqual({ targetPower:100 })
        }) 

        test('refresh and limits - limits have been set before',async () => {
            s.sendUpdate({ targetPower:100 });
            const res = await s.sendUpdate({refresh:true,targetPower:200});
            expect(res).toEqual({ targetPower:200 })
        }) 

        test('new limits - limits have been set before',async () => {
            s.sendUpdate( { minPower:100, maxPower:200 });
            const res = await s.sendUpdate({targetPower:200});
            expect(res).toEqual({ targetPower:200 })
        }) 


    });

    describe('onData',()=> {

        let s;
        beforeEach( ()=> {
            s = new Simulator({interface:'Simulator'});
            
        })

        test('setting once',async () => {
            const onData = jest.fn();
            s.onData(onData);
            s.update()
            expect(onData).toHaveBeenCalled();
        }) 

        test('setting twice',async () => {
            const onData1 = jest.fn();
            const onData2 = jest.fn();
            s.setMaxUpdateFrequency(-1)
            s.onData(onData1);
            s.update()
            expect(onData1).toHaveBeenCalled();
            expect(onData2).not.toHaveBeenCalled();
            onData1.mockReset();

            s.onData(onData2);
            s.update()
            expect(onData1).not.toHaveBeenCalled();
            expect(onData2).toHaveBeenCalled();
        }) 

    });

});
