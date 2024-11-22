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

            it('negative weight', ()=> {
                expect(() => { C.calculateSpeed(-1, 100,0);}).toThrow(IllegalArgumentException);                               
            })

            it('negative power', ()=> {
                expect(() => { C.calculateSpeed(70,-50,0);}).toThrow(IllegalArgumentException);                               
            })


        })

        test.skip( 'performance',()=> {

                let m = 80;
                const durations:number[] = []
                
                for (let i=0; i<4; i++) {
                    const start = Date.now();
                    for ( let power=25; power<=400; power++) 
                        for ( let slope=-10; slope<=10; slope+=0.1) {
                            C.calculateSpeed(m, power,slope,{cwA:0.45});                           
                        }
                    durations.push(Date.now()-start)
                }
            
            
        })


    })

    describe('calculateSpeedBike',()=>{
        test('snapshot',()=>{
            const result:string[] = [];
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

        test('no props',()=>{
            // default values (numGears:28, wheelCirc:2125) are used
            const speed1= C.calculateSpeedBike( 10, 90,  [36,52], [11,30], {numGears:28, wheelCirc:2125} ) 
            const speed = C.calculateSpeedBike( 10, 90,  [36,52], [11,30]) 
            expect(speed).toEqual(speed1)

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
        test('chain only one ring',()=>{
            const res = C.calculateSpeedBike(1,88,[39,39], [12,13,14,15,16,17,19,21,23,25],{wheelCirc: 2096, numGears: 10});
            expect(res).toBe(0)
        })

    })

    describe('calculateSpeedDaum', ()=> {

        test('race',()=>{
            const calc =(type?) => {
                const res:string[]  = [];
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
                const res:string[]  = [];
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
            const result:string[]  =[]
            for (let i = 0; i <= 100; i++) {
                const slope =  (i-50)/10
                const pwr = C.calculatePower(90, 30/3.6,slope);
                result.push( `${slope}:${ Math.round(pwr)}`);
            }
            expect(result).toMatchSnapshot();
            
        } )

        describe('exceptions',()=>{            
            test( 'm<0',()=>{ expect(()=>C.calculatePower(-1,30,1)).toThrow(IllegalArgumentException);})
            test( 'v<0',()=>{ expect(()=>C.calculatePower(80,-1,1)).toThrow(IllegalArgumentException);})

        })

    } ) 

    describe('calculateSlope',()=>{

        const v = (x)=>x/3.6
        const sl = (slope)=> Math.atan(slope/100)


        it('70kg,100W,5% slope', ()=> {
            const vT = C.calculateSpeed(70, 100, 5);
            expect(vT).toBeCloseTo(9.4,1)
            console.log( sl(5))
            
            const result = C.calculateSlope(70, 100, v(vT));
            expect(result).toBeCloseTo(5,1)

        })

        it('70kg,100W,49.1km/h => -5% slope', ()=> {
            console.log( sl(-5))

            const result = C.calculateSlope(70, 100, v(49.1));
            expect(result).toBeCloseTo(-5,1)
        })

        it('100kg,100W,27.1km/h => no slope', ()=> {
            const speed = C.calculateSpeed(100, 100, 0);
            console.log(speed)

            const power = C.calculatePower(100, v(27.1), 0);
            
            const result = C.calculateSlope(100, 100, v(speed))
            expect(result).toBeCloseTo(0,1)

            const result1 = C.calculateSlope(100, power, v(27.1))
            expect(result1).toBeCloseTo(0,1)
        })

        it('70kg,100W,-10% slope', ()=> {

            const P = C.calculatePower(70, v(66), -10);
            const result = C.calculateSlope(70, P, v(66));
            expect(result).toBeCloseTo(-10,1)
        })




    })

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

    describe('virtual Shifting',()=>{



        const calculatePowerAndDistance = (speed: number,prevSpeed:number, slope: number, m: number, t: number, props= {}) =>{ 
            
    
            const vPrev = (prevSpeed)/3.6
            const EkinPrev = 1/2*m*vPrev*vPrev;
            const vTarget = (speed||0) /3.6;
            const Ekin = 1/2*m*vTarget*vTarget;
    
            const powerDelta = t!==0 ? (EkinPrev - Ekin)/t : 0;
            const powerToMaintainSpeed = C.calculatePower(m,vPrev,slope,props);
            const power = powerToMaintainSpeed - powerDelta;
            
            const v = speed/3.6
            const distance = v*t;
    
            
            return power
    
        }

        test('82kg',()=>{
            
                const m = 82
                const v = (s)=>s/3.6
                
                const pwr1 = C.calculatePower(m, 5.88,0);
                
                const pwr2 = calculatePowerAndDistance(6.404*3.6, 6.404*3.6, 0, m, 1)
            
                console.log(pwr1,pwr2)
            
        } )


        test(('virtual shifting'),()=>{
            const numGears = 30
            const slopeInApp = -5
            const powerInitial = 50
            const m = 70
            const cadence = 90
            const speedInitial = 30.6 // C.calculateSpeed(m,powerInitial,slope)




            let gearInitial = 15;

            if (!gearInitial) {
                let minDiff

                for (let i=1;i<=numGears;i++) {
                    const speed = C.calculateSpeedBike( i, cadence,  [34,50], [11,36], {numGears, wheelCirc:2125} )
                    const diff = Math.abs(speed - speedInitial)
                    if (!minDiff || diff<minDiff) {
                        minDiff = diff
                        gearInitial = i
                    }
        
                }
        
        
            }
            // shift up
            console.log('initial Gear',gearInitial,'speed', speedInitial.toFixed(1),'slope',slopeInApp)
            


            const calculateSpeedAndDistance = (power: number,prevSpeed:number, slope: number, m: number, t: number, props= {}) => { 
                
        
                const vPrev = (prevSpeed )/3.6
                const EkinPrev = 1/2*m*vPrev*vPrev;
        
        
                let powerToMaintainSpeed = C.calculatePower(m,vPrev,slope,props);
        
                //no update for more than 30s - we need to reset
                if (t>=30) {
                    const speed = C.calculateSpeed(m,power,slope,props)            
                    return speed
                }
        
                const powerDelta = powerToMaintainSpeed - power;
                const Ekin = EkinPrev-powerDelta*t;
        
                if (Ekin>0) {
                    const v = Math.sqrt(2*Ekin/m);
                    const speed = v*3.6;
                    
        
                    
                    return speed
                }
                else {
                    // Power is not sufficiant to keep moving
                    const v = vPrev *0.5;
                    const speed = v*3.6;
                    
                    
                    return speed
        
                }
            }




            let slopeTarget = slopeInApp
            let speed = speedInitial        
            let power = powerInitial
            let speedInApp = speedInitial

            const switchGear = (gear,prevGear) => {
                let prevSpeed = C.calculateSpeedBike( prevGear, cadence,  [34,50], [11,36], {numGears, wheelCirc:2125} )
                speed = C.calculateSpeedBike( gear, cadence,  [34,50], [11,36], {numGears, wheelCirc:2125} )
                // / C.calculateSpeedBike( gear-1, cadence,  [34,50], [11,36], {numGears, wheelCirc:2125} ) 

                const power2 = C.calculatePower(m,speed/3.6,0)
                const power1 = C.calculatePower(m,prevSpeed/3.6,0)


                const vPrev = (prevSpeed )/3.6
                const EkinPrev = 1/2*m*vPrev*vPrev;

                const vNew = (speed )/3.6
                const EkinNew = 1/2*m*vNew*vNew;

                const powerDelta = (EkinNew - EkinPrev)/3;
                const slopeTargetA = C.calculateSlope(m, power, (speedInApp)/3.6);
                const slopeTargetB = C.calculateSlope(m, power+(power2-power1), (speedInApp)/3.6);

                //power = power+ powerDelta 
                
                slopeTarget = C.calculateSlope(m,power+ power2-power1, (speedInApp)/3.6);
                

                speedInApp = calculateSpeedAndDistance(power,speedInApp, slopeInApp,m,3)
                speedInApp = calculateSpeedAndDistance(power+ power2-power1,speedInApp, slopeInApp,m,7)
                power = power+ power2-power1
                        
                

                console.log('Gear',gear,'power',power, 'speed', speedInApp.toFixed(1),'slope',slopeInApp,'virtual slope',slopeTarget.toFixed(1))        

            }

            /*
            for (let gear=gearInitial+1;gear<=numGears;gear++) {
                switchGear(gear,gear-1)
            }
            for (let gear=numGears-1;gear>0;gear--) {
                switchGear(gear,gear+1)
            }
                */
            
            switchGear(18,15)
            switchGear(19,18)
            switchGear(19,19)
            switchGear(20,19)

        })
    })
})
