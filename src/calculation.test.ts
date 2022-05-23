import C, { IllegalArgumentException,solveCubic } from './calculations'

describe('Calculations', () => {
    describe ('calculateSpeed', ()=> {

        describe( 'normal use', ()=> {

            it('70kg,100W,no slope', ()=> {
                for (let slope=-10; slope<10; slope+=0.1) {
                    C.calculateSpeed(150, 100,slope);
                }

                const result = C.calculateSpeed(70, 100,0);
                expect(result).toBeCloseTo(26.3,1)
            })

            it('70kg,100W,1% slope', ()=> {
                const result = C.calculateSpeed(70, 100, 1);
                expect(result).toBeCloseTo(21.4,1)
            })

            it('70kg,100W,5% slope', ()=> {
                const result = C.calculateSpeed(70, 100, 5);
                expect(result).toBeCloseTo(9.4,1)
            })

            it('70kg,100W,10% slope', ()=> {
                const result = C.calculateSpeed(70, 100, 10);
                expect(result).toBeCloseTo(5.0,1)
            })

            it('70kg,100W,-1% slope', ()=> {
                const result = C.calculateSpeed(70, 100, -1);
                expect(result).toBeCloseTo(31.3,1)
            })

            it('70kg,100W,-5% slope', ()=> {
                const result = C.calculateSpeed(70, 100, -5);
                expect(result).toBeCloseTo(49.1,1)
            })

            it('70kg,100W,-10% slope', ()=> {
                const result = C.calculateSpeed(70, 100, -10);
                expect(result).toBeCloseTo(66.3,1)
            })

            it('100kg,100W,no slope => 27.1km/h', ()=> {
                const result = C.calculateSpeed(100, 100,0);
                expect(result).toBeCloseTo(25.5,1)
            })
        })

        describe( 'props',()=> {

            it('70kg,100W,no slope,cWA=0.45', ()=> {
                const result = C.calculateSpeed(70, 100,0,{cwA:0.45});
                expect(result).toBeCloseTo(24.3,1)
            })
            it('70kg,100W,10% slope,cWA=0.45', ()=> {
                const result = C.calculateSpeed(70, 100,10,{cwA:0.45});
                expect(result).toBeCloseTo(5.0,1)
            })

            it('70kg,100W,0% slope,cWA=0.2798, rho = 1,1455 (35°,0m), cRR=0,00330', ()=> {
                const result = C.calculateSpeed(70, 100,0,{cwA:0.2798, rho:1.1455, cRR:0.00330});
                expect(result).toBeCloseTo(28.8,1)
            })

            it('70kg,100W,0% slope, unknown bike type ', ()=> {
                const result = C.calculateSpeed(70, 100,0,{bikeType:'something'});
                const resultRace = C.calculateSpeed(70, 100,0,{bikeType:'race'});
                expect(result).toBeCloseTo(resultRace,2)
            })
            it('70kg,100W,0% slope triathlon', ()=> {
                const result = C.calculateSpeed(70, 100,0,{bikeType:'triathlon'});
                
                expect(result).toBeCloseTo(27.9,1)
            })

            it('70kg,100W,0% slope mountain', ()=> {
                const result = C.calculateSpeed(70, 100,0,{bikeType:'mountain'});
                
                expect(result).toBeCloseTo(22.6,1)
            })

        })


        describe('exceptions',()=> {

            it('empty weight', ()=> {
                expect(() => { C.calculateSpeed(null, 100,0);}).toThrow(IllegalArgumentException);                               
                expect(() => { C.calculateSpeed(undefined, 100,0);}).toThrow(IllegalArgumentException);                               
            })
            it('negative weight', ()=> {
                expect(() => { C.calculateSpeed(-1, 100,0);}).toThrow(IllegalArgumentException);                               
            })

            it('empty power', ()=> {
                expect(() => { C.calculateSpeed(70,null,0);}).toThrow(IllegalArgumentException);                               
                expect(() => { C.calculateSpeed(70, undefined,0);}).toThrow(IllegalArgumentException);                               
            })
            it('negative power', ()=> {
                expect(() => { C.calculateSpeed(70,-50,0);}).toThrow(IllegalArgumentException);                               
            })

            it('empty slope', ()=> {

                const result = C.calculateSpeed(70,100,null);
                expect(result).toBeCloseTo(26.3,1)

                const result1 = C.calculateSpeed(70,100,undefined);
                expect(result1).toBeCloseTo(26.3,1)

            })

        })

        test.skip( 'performance',()=> {

                let m = 80;
                const durations = []
                let result;
                let j;
                
                for (let i=0; i<4; i++) {
                    const start = Date.now();
                    j=0;
                    for ( let power=25; power<=400; power++) 
                        for ( let slope=-10; slope<=10; slope+=0.1) {
                            result = C.calculateSpeed(m, power,slope,{cwA:0.45});
                            j++;
                            
                        }
                    durations.push(Date.now()-start)
                }
            
            console.log(durations.map (d=>`${d}ms => ${d/j}ms/call`))                
        })


    })

    describe('calculateSpeedBike',()=>{
        test('snapshot',()=>{
            const result = [];
            for (let gear= 1; gear <= 28; gear++) {
                let s = `${gear}:`
                for (let rpm=88; rpm <= 93; rpm++) {
                    const speed = C.calculateSpeedBike( gear, rpm,  [36,52], [11,30], {numGears:28, wheelCirc:2125} ) 
                    if(rpm!==88) s+=','
                    s+=`${speed.toFixed(1)}`
                }
                result.push(s)                
            }
            expect(result).toMatchSnapshot()
        })

        test('chainData missing',()=>{
            expect(() => { C.calculateSpeedBike(1,88,[],[11,30],{numGears:28, wheelCirc:2125});}).toThrow(IllegalArgumentException);                               

        })
        test('chainData incomplete',()=>{
            expect(() => { C.calculateSpeedBike(1,88,[],[11],{numGears:28, wheelCirc:2125});}).toThrow(IllegalArgumentException);                               

        })
        test('chainData too large',()=>{
            expect(() => { C.calculateSpeedBike(1,88,[],[11,30,34],{numGears:28, wheelCirc:2125});}).toThrow(IllegalArgumentException);                               

        })

        test('cassette data missing',()=>{
            expect(() => { C.calculateSpeedBike(1,88,[36,52],[],{numGears:28, wheelCirc:2125});}).toThrow(IllegalArgumentException);                               

        })
        test('cassette data incomplete',()=>{
            expect(() => { C.calculateSpeedBike(1,88,[36,52],[11],{numGears:28, wheelCirc:2125});}).toThrow(IllegalArgumentException);                               

        })
        test('cassette data  too large',()=>{
            expect(() => { C.calculateSpeedBike(1,88,[36,52],[11,12,13,15,17,19],{numGears:28, wheelCirc:2125});}).toThrow(IllegalArgumentException);                               

        })
        test('cassette data  negative',()=>{
            expect(() => { C.calculateSpeedBike(1,88,[36,52],[-11,12],{numGears:28, wheelCirc:2125});}).toThrow(IllegalArgumentException);                               

        })

    })

    describe('calculateSpeedDaum', ()=> {

        test('race',()=>{
            const calc =(type?) => {
                const res  = [];
                for (let i = 1; i <= 28; i++) /* gears*/ {
                    for (let j = 0; j <= 120; j++) /* rpm */ {
                        const speed =C.calculateSpeedDaum(i,j,type)
                        res.push( `${i},${j},${ speed.toFixed(1)}`);
                    }
                }
                return res;
            }

            const NoArgs = calc();
            const race = calc('race')
            const zero = calc(0)
            const tri = calc('triathlon')
            expect(race).toMatchSnapshot();
            expect(race).toEqual(zero);
            expect(race).toEqual(NoArgs);
            expect(race).toEqual(tri);
        })

        test('others',()=>{
            const calc =(type?) => {
                const res  = [];
                for (let i = 1; i <= 28; i++) /* gears*/ {
                    for (let j = 0; j <= 120; j++) /* rpm */ {
                        const speed =C.calculateSpeedDaum(i,j,type)
                        res.push( `${i},${j},${ speed.toFixed(1)}`);
                    }
                }
                return res;
            }

            const mountain = calc('mountain')
            const one = calc(1)
            expect(mountain).toMatchSnapshot();
            expect(mountain).toEqual(one);
            
        })

    })

    describe('calculate Power',()=>{
        test('90kg',()=>{
            const result  =[]
            for (let i = 0; i <= 100; i++) {
                const slope =  (i-50)/10
                const pwr = C.calculatePower(90, 30/3.6,slope);
                result.push( `${slope}:${ Math.round(pwr)}`);
            }
            expect(result).toMatchSnapshot();
            
        } )

        describe('exceptions',()=>{            
            test( 'm==undefined',()=>{ expect( ()=>C.calculatePower(undefined,30,1)).toThrow(IllegalArgumentException);})
            test( 'm=null',()=>{ expect(()=>C.calculatePower(null,30,1)).toThrow(IllegalArgumentException);})
            test( 'm<0',()=>{ expect(()=>C.calculatePower(-1,30,1)).toThrow(IllegalArgumentException);})
            test( 'v==undefined',()=>{ expect(()=>C.calculatePower(80,undefined,1)).toThrow(IllegalArgumentException);})
            test( 'v=null',()=>{ expect(()=>C.calculatePower(80,null,1)).toThrow(IllegalArgumentException);})
            test( 'v<0',()=>{ expect(()=>C.calculatePower(80,-1,1)).toThrow(IllegalArgumentException);})
            test( 'slope undefined',()=>{ 
                const zero = C.calculatePower(80,30,0);
                const undef =  C.calculatePower(80,30,undefined);
                expect(undef).toBeCloseTo(zero,5);
            })

        })

    } ) 

    describe('solveCubic',()=>{
        test('solveCubic (-7, -6)',()=>{
            const res = solveCubic(-7, -6);
            expect(res.length).toBe(3);
            expect(res[0]).toBeCloseTo(3.0,1);
            expect(res[1]).toBeCloseTo(-2.0,1);
            expect(res[2]).toBeCloseTo(-1.0,1);
        } )

        test('solveCubic(-6, 20)',()=>{
            const res = solveCubic(-6,20);
            expect(res.length).toBe(1);
            expect(res[0]).toBeCloseTo(-3.4,1);
        } )

        test('solveCubic(-6, 4)',()=>{
            const res = solveCubic(-6,4);
        
            expect(res.length).toBe(3);
            expect(res[0]).toBeCloseTo(-2.7,1);
            expect(res[1]).toBeCloseTo(2.0,1);
            expect(res[2]).toBeCloseTo(0.7,1);
        } )

        test('solveCubic(-15, -126)',()=>{
            const res = solveCubic(-15, -126);
            expect(res.length).toBe(1);
            expect(res[0]).toBeCloseTo(6,0);
        } )

        test('solveCubic(-6, -40)',()=>{
            const res = solveCubic(-6, -40  );
            expect(res.length).toBe(1);
            expect(res[0]).toBeCloseTo(4,0);
        } )

        test('solveCubic(-3, 2): D=0',()=>{
            const res = solveCubic(-3, 2  );
            expect(res.length).toBe(2);
            expect(res[0]).toBeCloseTo(-2,0);
            expect(res[1]).toBeCloseTo(1,0);
        } )

        test('solveCubic(0, -27)',()=>{
            const res = solveCubic(0,-27);
            expect(res.length).toBe(1);
            expect(res[0]).toBeCloseTo(3,1);
        } )

        test('solveCubic(0, 0)',()=>{
            const res = solveCubic(0,0);
            expect(res.length).toBe(1);
            expect(res[0]).toBeCloseTo(0,1);
        } )

    })
})
