import MockAdapter from '../../test/mock-adapter';
import FMResistanceMode from './fm-resistance'


describe('BleFMResistanceMode', () => {

    let mode:FMResistanceMode;
    beforeAll( ()=> {
        mode = new FMResistanceMode( new MockAdapter());
    })


    describe ( 'statics', () => {
        test('getName', () => {
            expect(mode.getName()).toBe('Resistance');
        })

        test('isERG, isSIM, isResistance', () => {
            expect(mode.isERG()).toBe(false);
            expect(mode.isSIM()).toBe(false);
            expect(mode.isResistance()).toBe(true);
        })

        test('suppport ERG Mode',()=>{
            expect(FMResistanceMode.supportsERGMode()).toBe(false)
        })
    })

    describe ( 'getDescription', () => {
        test('should match description from config', () => {
            const descr = mode.getDescription();
            expect(descr).toMatchSnapshot();
        })

    })

    
    describe ( 'getProperties', () => {
        test('should return the start gear, autoResistance and maxSlope', () => {
            const props = mode.getProperties()
            expect(props.map(p=>p.key)).toEqual(['startGear','autoResistance','maxSlope'])
            expect(props[0]).toMatchObject({key:'startGear', name: 'Initial Gear', description: 'Initial Gear', type: 'Integer',default:5,min:1, max:26})
            expect(props[1]).toMatchObject({key:'autoResistance', type: 'Boolean', default:false})
            expect(props[2]).toMatchObject({key:'maxSlope', type: 'Integer', default:10})
        })
    })

    describe ( 'per adapter default', () => {
        const condition = (m:FMResistanceMode) => m.getProperties().find(p=>p.key==='maxSlope').condition

        test('default is off, maxSlope is hidden unless auto resistance is enabled', () => {
            const m = new FMResistanceMode( new MockAdapter());
            expect(m.isAutoResistance()).toBe(false)
            expect(condition(m)({})).toBe(false)
            expect(condition(m)(undefined)).toBe(false)
            expect(condition(m)({autoResistance:true})).toBe(true)
        })

        test('default on: autoResistance is on, maxSlope is visible if the key is missing', () => {
            const m = new FMResistanceMode( new MockAdapter());
            m.setAutoResistanceDefault(true)
            expect(m.isAutoResistance()).toBe(true)
            expect(m.getProperties().find(p=>p.key==='autoResistance').default).toBe(true)
            expect(condition(m)({})).toBe(true)
            expect(condition(m)({autoResistance:false})).toBe(false)
            expect(condition(m)({autoResistance:'false'})).toBe(false)
        })

        test('saved setting overrides the default', () => {
            const m = new FMResistanceMode( new MockAdapter());
            m.setAutoResistanceDefault(true)
            m.setSettings({autoResistance:false})
            expect(m.isAutoResistance()).toBe(false)
        })

        test('default is not shared between mode instances', () => {
            const a = new FMResistanceMode( new MockAdapter());
            const b = new FMResistanceMode( new MockAdapter());
            a.setAutoResistanceDefault(true)
            expect(b.isAutoResistance()).toBe(false)
        })
    })

    describe ( 'getBikeInitRequest', () => {
        test('with default settings', () => {
            expect(mode.getBikeInitRequest()).toEqual({targetResistance:16});
        })
        test('with user defined settings', () => {
            mode.setSetting('startGear',11);
            expect(mode.getBikeInitRequest()).toEqual({targetResistance:40});
        })
    })

    describe ( 'sendBikeUpdate', () => {
        describe('slope',()=> {
            beforeEach(()=> {
                mode = new FMResistanceMode( new MockAdapter());
            })

            test('should be 0 if not set via sendBikeUpdate', () => {
                expect(mode.data.slope).toBe(0);
            })
            test('should be updated if set via sendBikeUpdate', () => {
                mode.sendBikeUpdate({slope:1});
                expect(mode.data.slope).toBe(1);
            })
    
        })

        test('new resistance target', () => {
            expect(mode.sendBikeUpdate({targetResistance:100})).toEqual({targetResistance:100});            
            
            expect(mode.sendBikeUpdate({targetResistance:-1})).toEqual({targetResistance:0});            
            expect(mode.sendBikeUpdate({targetResistance:1000})).toEqual({targetResistance:100});            
            expect(mode.sendBikeUpdate({targetResistance:5.6})).toEqual({targetResistance:5});                        
        })

        test('gear change', () => {
            mode.sendBikeUpdate(mode.getBikeInitRequest())

            expect(mode.sendBikeUpdate({gearDelta:3})).toEqual({targetResistance:28});            
            expect(mode.sendBikeUpdate({gearDelta:-2})).toEqual({targetResistance:20});            
            expect(mode.sendBikeUpdate({gearDelta:-10})).toEqual({targetResistance:0});            
            expect(mode.sendBikeUpdate({gearDelta:30})).toEqual({targetResistance:100});            
        })
    })

    describe( 'updateData', () => {
        beforeEach(()=> {
            mode = new FMResistanceMode( new MockAdapter());
        })

        test('should set gear based on resistance', () => {
            let data = mode.updateData( { power:100, resistance:0, speed:20, pedalRpm:60} );
            expect(data.gear).toBe(1);

            data = mode.updateData( { power:100, resistance:50, speed:20, pedalRpm:60} );
            expect(data.gear).toBe(13);

            data = mode.updateData( { power:100, resistance:100, speed:20, pedalRpm:60} );
            expect(data.gear).toBe(26);
        })
    })


    describe ( 'confirmed', () => {
        beforeEach(()=> {
            mode = new FMResistanceMode( new MockAdapter());
        })          
        test('should store confirmed resistance', () => {
            mode.confirmed( { targetResistance:55 } );
            expect( (mode as any).confirmedResistance ).toBe(55);
        })  
    })



    describe ( 'auto resistance', () => {
        let now:number
        let spy: ReturnType<typeof jest.spyOn>
        const newMode = (settings:any={}) => {
            const m = new FMResistanceMode( new MockAdapter());
            m.setAutoResistanceDefault(true)
            m.setSettings({startGear:5, maxSlope:10, ...settings})
            return m
        }
        const advance = (ms=1100) => { now += ms }
        // start gear 5 => 16, 100 at 10%: 8.4 per %
        beforeEach(()=> {
            now = 1_000_000
            spy = jest.spyOn(Date,'now').mockImplementation(()=>now)
        })
        afterEach(()=> { spy.mockRestore() })

        test('init request uses start gear at 0% and the current slope later', () => {
            mode = newMode()
            expect(mode.getBikeInitRequest()).toEqual({targetResistance:16})
            mode.sendBikeUpdate({slope:5})
            expect(mode.getBikeInitRequest()).toEqual({targetResistance:58})
        })

        test('curve: 0%, maxSlope, above maxSlope, downhill at 50%', () => {
            mode = newMode()
            expect(mode.sendBikeUpdate({slope:0})).toMatchObject({targetResistance:16})
            advance()
            expect(mode.sendBikeUpdate({slope:10})).toMatchObject({targetResistance:100})
            advance()
            // already at 100, nothing new to send
            expect(mode.sendBikeUpdate({slope:25}).targetResistance).toBeUndefined()
            expect(mode.getBikeInitRequest()).toEqual({targetResistance:100})
            advance()
            expect(mode.sendBikeUpdate({slope:-2})).toMatchObject({targetResistance:8})
            advance()
            expect(mode.sendBikeUpdate({slope:-30})).toMatchObject({targetResistance:0})
        })

        test('maxSlope is read as number', () => {
            mode = newMode({maxSlope:'20'})
            mode.sendBikeUpdate({slope:20})
            expect(mode.getBikeInitRequest()).toEqual({targetResistance:100})
        })

        test('invalid maxSlope falls back to 10', () => {
            mode = newMode({maxSlope:'abc'})
            mode.sendBikeUpdate({slope:10})
            expect(mode.getBikeInitRequest()).toEqual({targetResistance:100})
        })

        test('gear shifts add 4 levels per gear and are clamped to the output range', () => {
            mode = newMode()
            expect(mode.sendBikeUpdate({gearDelta:2})).toEqual({targetResistance:24})
            expect(mode.sendBikeUpdate({gearDelta:-4})).toEqual({targetResistance:8})
            mode.sendBikeUpdate({slope:10})
            advance()
            expect(mode.sendBikeUpdate({slope:10})).toMatchObject({targetResistance:92})
            expect(mode.sendBikeUpdate({gearDelta:5})).toEqual({targetResistance:100})
        })

        test('gear offset is clamped so that the virtual gear stays within 1..26', () => {
            mode = newMode()
            mode.sendBikeUpdate({gearDelta:100})
            expect(mode.updateData({power:100,speed:20,pedalRpm:60,resistance:50}).gear).toBe(26)
            // one shift down must be immediately effective
            mode.sendBikeUpdate({gearDelta:-1})
            expect(mode.updateData({power:100,speed:20,pedalRpm:60,resistance:50}).gear).toBe(25)
            mode.sendBikeUpdate({gearDelta:-100})
            expect(mode.updateData({power:100,speed:20,pedalRpm:60,resistance:50}).gear).toBe(1)
            expect(mode.sendBikeUpdate({gearDelta:1})).toEqual({targetResistance:4})
        })

        test('throttle: interim slopes are skipped, the latest slope is sent when allowed', () => {
            mode = newMode()
            expect(mode.sendBikeUpdate({slope:0})).toMatchObject({targetResistance:16})
            advance(300)
            const r1 = mode.sendBikeUpdate({slope:2})
            expect(r1.targetResistance).toBeUndefined()
            advance(300)
            expect(mode.sendBikeUpdate({slope:4}).targetResistance).toBeUndefined()
            advance(500)
            // slope 4 would be applied, even if the request comes without a slope
            expect(mode.sendBikeUpdate({refresh:true}).targetResistance).toBe(50)
        })

        test('throttle: same target is not sent again', () => {
            mode = newMode()
            mode.sendBikeUpdate({slope:0})
            advance()
            expect(mode.sendBikeUpdate({slope:0}).targetResistance).toBeUndefined()
        })

        test('throttle: gear shifts bypass the throttle', () => {
            mode = newMode()
            mode.sendBikeUpdate({slope:0})
            advance(100)
            expect(mode.sendBikeUpdate({gearDelta:1})).toEqual({targetResistance:20})
            advance(100)
            expect(mode.sendBikeUpdate({gearDelta:1})).toEqual({targetResistance:24})
        })

        test('gearStr shows the virtual gear, independent of the reported resistance', () => {
            mode = newMode()
            mode.sendBikeUpdate({gearDelta:2})
            const data = mode.updateData({power:100,speed:20,pedalRpm:60,resistance:90})
            expect(data.gear).toBe(7)
            expect(data.gearStr).toBe('7')

            const data2 = mode.updateData({power:100,speed:20,pedalRpm:60})
            expect(data2.gearStr).toBe('7')
        })

        test('pause/resume re-sends the curve at the current slope with the kept offset, restart resets it', () => {
            mode = newMode()
            mode.sendBikeUpdate({gearDelta:1})
            mode.sendBikeUpdate({slope:5})
            expect(mode.getBikeInitRequest()).toEqual({targetResistance:62})

            mode.resetSession()
            expect(mode.getBikeInitRequest()).toEqual({targetResistance:58})
        })

        test('summary is logged once with the collected stats', () => {
            mode = newMode()
            const logEvent = jest.fn()
            mode.logEvent = logEvent
            mode.sendBikeUpdate(mode.getBikeInitRequest())
            advance(2000)
            mode.sendBikeUpdate({slope:10})
            mode.sendBikeUpdate({gearDelta:-1})
            mode.registerFailedUpdate()
            mode.logSummary()
            mode.logSummary()
            const calls = logEvent.mock.calls.filter( c=> c[0].message==='auto resistance summary')
            expect(calls).toHaveLength(1)
            expect(calls[0][0]).toMatchObject({updatesSent:3, updatesFailed:1, gearChanges:1, targetMin:16, targetMax:100, durationSec:2})
        })

        test('manual mode (auto off) behaves like before: slope is ignored for the target', () => {
            mode = newMode({autoResistance:false})
            expect(mode.sendBikeUpdate({slope:8}).targetResistance).toBeUndefined()
            advance()
            expect(mode.sendBikeUpdate({slope:9}).targetResistance).toBeUndefined()
            expect(mode.getBikeInitRequest()).toEqual({targetResistance:16})
            mode.sendBikeUpdate(mode.getBikeInitRequest())
            expect(mode.sendBikeUpdate({gearDelta:3})).toEqual({targetResistance:28})
        })
    })

})
