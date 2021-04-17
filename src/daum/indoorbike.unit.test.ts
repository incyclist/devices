import IndoorBikeProcessor from './indoorbike'

describe ( 'IndoorBikeProcessor', ()=> {

    describe ( 'setValues', ()=> {

        test ( 'with power limits ', ()=> {
            const bike = { settings:{}} as any;
            bike.getUserWeight = jest.fn( ()=> 75);
            bike.getBikeWeight = jest.fn( ()=> 10);
            
            const p = new IndoorBikeProcessor( bike )
            
            const data  = p.setValues({minPower:200, maxPower:200})
            expect(data.targetPower).toBe(200);
    
        })

        test ( 'empty data at start', ()=> {
            const bike = { settings:{}} as any
            bike.getUserWeight = jest.fn( ()=> 75);
            bike.getBikeWeight = jest.fn( ()=> 10);
            
            const p = new IndoorBikeProcessor( bike )
            
            const data  = p.setValues({})
            expect(data.targetPower).toBe(50);
    
        })

        test ( 'pedalling in gear 19 - right after start', ()=> {
            const bike = { settings:{}} as any
            bike.getUserWeight = jest.fn( ()=> 75);
            bike.getBikeWeight = jest.fn( ()=> 10);
            
            const p = new IndoorBikeProcessor( bike )
            p.prevGear = 19;
            p.prevRpm  = 91;
            p.prevSpeed = 36;
            const data  = p.setValues({refresh:true})
            expect(data.targetPower).toBeCloseTo(278,0)
    
        })

        test ( 'pedalling in gear 19 - empty data after power limits ', ()=> {
            const bike = { settings:{}} as any
            bike.getUserWeight = jest.fn( ()=> 75);
            bike.getBikeWeight = jest.fn( ()=> 10);
            
            const p = new IndoorBikeProcessor( bike )
            p.prevGear = 19;
            p.prevRpm  = 91;
            p.prevSpeed = 36;

            p.setValues({minPower:200, maxPower:200})
            const data  = p.setValues({})
            expect(data.targetPower).toBeCloseTo(278,0)
    
        })

        test ( 'pedalling in gear 19 - refresh command  after power limits ', ()=> {
            const bike = { settings:{}} as any
            bike.getUserWeight = jest.fn( ()=> 75);
            bike.getBikeWeight = jest.fn( ()=> 10);
            
            const p = new IndoorBikeProcessor( bike )
            p.prevGear = 19;
            p.prevRpm  = 91;
            p.prevSpeed = 36;

            p.setValues({minPower:200, maxPower:200})
            const data  = p.setValues({refresh:true})
            expect(data.targetPower).toBeCloseTo(200,0)
    
        })


        test ( 'pedalling in gear 19, clear data followed by refresh after power limits ', ()=> {
            const bike = { settings:{}} as any
            bike.getUserWeight = jest.fn( ()=> 75);
            bike.getBikeWeight = jest.fn( ()=> 10);
            
            const p = new IndoorBikeProcessor( bike )
            p.prevGear = 19;
            p.prevRpm  = 91;
            p.prevSpeed = 36;

            p.setValues({minPower:200, maxPower:200})
            p.setValues({})
            const data  = p.setValues({refresh:true})
            expect(data.targetPower).toBeCloseTo(278,0)
    
        })

    })
})