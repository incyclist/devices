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
            expect(s.paused).toBeUndefined()
            expect(s.time).toBeUndefined()
            expect(s.iv).toBeUndefined()
            expect(s.getProtocolName()).toBe(SimulatorProtocol.NAME)
            
        }) 


    });

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
            expect(s.paused).toBe(true)
        }) 

        test('promise: repetative start',async () => {
            await s.start();
            const iv = s.iv;
            const res = s.start();

            expect(res.error).toBeUndefined();
            expect(s.iv).toEqual(iv);
            expect(s.started).toBe(true)
            expect(s.paused).toBe(true)
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



});
