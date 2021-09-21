import Calclulations, { IllegalArgumentException } from './calculations'

describe('Calculations', () => {
    describe ('calculateSpeed', ()=> {

        describe( 'normal use', ()=> {

            it('70kg,100W,no slope => 28km/h', ()=> {
                const result = Calclulations.calculateSpeed(70, 100,0);
                expect(result).toBeCloseTo(28.0,1)
            })

            it('70kg,100W,1% slope => 22.4km/h', ()=> {
                const result = Calclulations.calculateSpeed(70, 100, 1);
                expect(result).toBeCloseTo(22.4,1)
            })

            it('70kg,100W,5% slope => 9.5km/h', ()=> {
                const result = Calclulations.calculateSpeed(70, 100, 5);
                expect(result).toBeCloseTo(9.5,1)
            })

            it('70kg,100W,10% slope => 5.1km/h', ()=> {
                const result = Calclulations.calculateSpeed(70, 100, 10);
                expect(result).toBeCloseTo(5.1,1)
            })

            it('70kg,100W,-1% slope => 33.7km/h', ()=> {
                const result = Calclulations.calculateSpeed(70, 100, -1);
                expect(result).toBeCloseTo(33.7,1)
            })

            it('70kg,100W,-5% slope => 46.9km/h', ()=> {
                const result = Calclulations.calculateSpeed(70, 100, -5);
                expect(result).toBeCloseTo(46.9,1)
            })

            it('70kg,100W,-10% slope => 63.2km/h', ()=> {
                const result = Calclulations.calculateSpeed(70, 100, -10);
                expect(result).toBeCloseTo(63.2,1)
            })

            it('100kg,100W,no slope => 27.1km/h', ()=> {
                const result = Calclulations.calculateSpeed(100, 100,0);
                expect(result).toBeCloseTo(27.1,1)
            })
        })

        describe( 'props',()=> {
            it('70kg,100W,no slope,cWA=0.4 => 23.7km/h', ()=> {
                const result = Calclulations.calculateSpeed(70, 100,0,{cwA:0.45});
                expect(result).toBeCloseTo(23.7,1)
            })
            it('70kg,100W,10% slope,cWA=0.4 => 5.0km/h', ()=> {
                const result = Calclulations.calculateSpeed(70, 100,10,{cwA:0.45});
                expect(result).toBeCloseTo(5.0,1)
            })

            it('70kg,100W,no slope,rho=1.2041(20°,350m) => 23.7km/h', ()=> {
                const result = Calclulations.calculateSpeed(70, 100,0,{cwA:0.45});
                expect(result).toBeCloseTo(23.7,1)
            })
            it('70kg,100W,10% slope,cWA=0.4 => 5.0km/h', ()=> {
                const result = Calclulations.calculateSpeed(70, 100,10,{cwA:0.45});
                expect(result).toBeCloseTo(5.0,1)
            })

            it('70kg,100W,0% slope,cWA=0.2798, rho = 1,1455 (35°,0m), cRR=0,00330, => 5.0km/h', ()=> {
                const result = Calclulations.calculateSpeed(70, 100,0,{cwA:0.2798, rho:1.1455, cRR:0.00330});
                expect(result).toBeCloseTo(27.7,1)
            })
 
        })


        describe('exceptions',()=> {
            it('empty weight', ()=> {
                expect(() => { Calclulations.calculateSpeed(null, 100,0);}).toThrow(IllegalArgumentException);                               
                expect(() => { Calclulations.calculateSpeed(undefined, 100,0);}).toThrow(IllegalArgumentException);                               
            })
            it('negative weight', ()=> {
                expect(() => { Calclulations.calculateSpeed(-1, 100,0);}).toThrow(IllegalArgumentException);                               
            })

            it('empty power', ()=> {
                expect(() => { Calclulations.calculateSpeed(70,null,0);}).toThrow(IllegalArgumentException);                               
                expect(() => { Calclulations.calculateSpeed(70, undefined,0);}).toThrow(IllegalArgumentException);                               
            })
            it('negative power', ()=> {
                expect(() => { Calclulations.calculateSpeed(70,-50,0);}).toThrow(IllegalArgumentException);                               
            })

            it('empty slope', ()=> {

                const result = Calclulations.calculateSpeed(70,100,null);
                expect(result).toBeCloseTo(28.0,1)

                const result1 = Calclulations.calculateSpeed(70,100,undefined);
                expect(result1).toBeCloseTo(28.0,1)

            })

        })

    })
})
