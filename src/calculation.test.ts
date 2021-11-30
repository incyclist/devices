import C, { IllegalArgumentException,solveCubic } from './calculations'

describe('Calculations', () => {
    describe ('calculateSpeed', ()=> {

        describe( 'normal use', ()=> {

            it('70kg,100W,no slope => 28km/h', ()=> {
                const result = C.calculateSpeed(70, 100,0);
                expect(result).toBeCloseTo(28.0,1)
            })

            it('70kg,100W,1% slope => 22.4km/h', ()=> {
                const result = C.calculateSpeed(70, 100, 1);
                expect(result).toBeCloseTo(22.4,1)
            })

            it('70kg,100W,5% slope => 9.5km/h', ()=> {
                const result = C.calculateSpeed(70, 100, 5);
                expect(result).toBeCloseTo(9.5,1)
            })

            it('70kg,100W,10% slope => 5.1km/h', ()=> {
                const result = C.calculateSpeed(70, 100, 10);
                expect(result).toBeCloseTo(5.1,1)
            })

            it('70kg,100W,-1% slope => 33.7km/h', ()=> {
                const result = C.calculateSpeed(70, 100, -1);
                expect(result).toBeCloseTo(33.7,1)
            })

            it('70kg,100W,-5% slope => 46.9km/h', ()=> {
                const result = C.calculateSpeed(70, 100, -5);
                expect(result).toBeCloseTo(46.9,1)
            })

            it('70kg,100W,-10% slope => 63.2km/h', ()=> {
                const result = C.calculateSpeed(70, 100, -10);
                expect(result).toBeCloseTo(63.2,1)
            })

            it('100kg,100W,no slope => 27.1km/h', ()=> {
                const result = C.calculateSpeed(100, 100,0);
                expect(result).toBeCloseTo(27.1,1)
            })
        })

        describe( 'props',()=> {
            it('70kg,100W,no slope,cWA=0.4 => 23.7km/h', ()=> {
                const result = C.calculateSpeed(70, 100,0,{cwA:0.45});
                expect(result).toBeCloseTo(23.7,1)
            })
            it('70kg,100W,10% slope,cWA=0.4 => 5.0km/h', ()=> {
                const result = C.calculateSpeed(70, 100,10,{cwA:0.45});
                expect(result).toBeCloseTo(5.0,1)
            })

            it('70kg,100W,no slope,rho=1.2041(20°,350m) => 23.7km/h', ()=> {
                const result = C.calculateSpeed(70, 100,0,{cwA:0.45});
                expect(result).toBeCloseTo(23.7,1)
            })
            it('70kg,100W,10% slope,cWA=0.4 => 5.0km/h', ()=> {
                const result = C.calculateSpeed(70, 100,10,{cwA:0.45});
                expect(result).toBeCloseTo(5.0,1)
            })

            it('70kg,100W,0% slope,cWA=0.2798, rho = 1,1455 (35°,0m), cRR=0,00330, => 5.0km/h', ()=> {
                const result = C.calculateSpeed(70, 100,0,{cwA:0.2798, rho:1.1455, cRR:0.00330});
                expect(result).toBeCloseTo(27.7,1)
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
                expect(result).toBeCloseTo(28.0,1)

                const result1 = C.calculateSpeed(70,100,undefined);
                expect(result1).toBeCloseTo(28.0,1)

            })

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
            expect(race).toMatchSnapshot();
            expect(race).toEqual(zero);
            expect(race).toEqual(NoArgs);
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
        describe('90kg',()=>{
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
