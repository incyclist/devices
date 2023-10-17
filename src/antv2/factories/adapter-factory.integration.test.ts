import AntAdapterFactory from './adapter-factory'
import FE from '../fe/adapter'
import HR from '../hr/adapter'
import PWR from '../pwr/adapter'
import { Profile } from 'incyclist-ant-plus'

class Mock extends FE { }

describe ('Ant Adapter Factory',()=>{

    describe('register',()=>{

        test('add multipe _getAll()',()=>{
            const af = new AntAdapterFactory()
            expect(af._getAll().length).toBe(0)

            af.register('PWR', 'Power Meter', PWR)
            af.register('HR', 'Heartrate Monitor', HR )
            af.register('FE', 'Smart Trainer', FE)

            expect(af._getAll().length).toBe(3)
            expect(af._getAll()[0]).toEqual( {antProfile:'PWR', incyclistProfile:'Power Meter',Adapter: PWR})
        })

        test('add the same adapter twice',()=>{
            const af = new AntAdapterFactory()
            expect(af._getAll().length).toBe(0)

            af.register('PWR', 'Power Meter', PWR)
            af.register('HR', 'Heartrate Monitor', HR )
            af.register('FE', 'Smart Trainer', FE)
            af.register('FE', 'Smart Trainer', FE)

            expect(af._getAll().length).toBe(3)
        })

        test('add two _getAll() for the same profile - will overwirte previous',()=>{
            const af = new AntAdapterFactory()
            expect(af._getAll().length).toBe(0)

            af.register('PWR', 'Power Meter', PWR)
            af.register('HR', 'Heartrate Monitor', HR )
            af.register('FE', 'Smart Trainer', FE)
            af.register('FE', 'Smart Trainer', Mock)

            expect(af._getAll().length).toBe(3)
            expect(af.getAdapter({antProfile:'FE',}).Adapter).toEqual(Mock)
        })

    })

    describe('getAdapter',()=>{

        let af;
        beforeEach( ()=>{
            af = AntAdapterFactory.getInstance()
            af.register('PWR', 'Power Meter', PWR)
            af.register('HR', 'Heartrate Monitor', HR )
            af.register('FE', 'Smart Trainer', FE)
        })

        afterAll( ()=>{
            (AntAdapterFactory as any)._instance = undefined
        })

        test('using ant profile name',()=>{
            const res= af.getAdapter({antProfile:'PWR'})
            expect(res.Adapter).toBe(PWR)
        })

        test('using legacy profile name',()=>{
            const res= af.getAdapter({incyclistProfile:'Power Meter'})
            expect(res.Adapter).toBe(PWR)

        })
        test('using both - antProfile has precedence if found',()=>{
            let res;
            res = af.getAdapter({antProfile:'FE', incyclistProfile:'Power Meter'})
            expect(res.Adapter).toBe(FE)
            res = af.getAdapter({antProfile:'WGT', incyclistProfile:'Power Meter'})
            expect(res.Adapter).toBe(PWR)
            
        })
        test('no query specified',()=>{
            expect( ()=> {af.getAdapter({})})
                .toThrow('Illegal arguments: either "antProfile" or "incyclistProfile" must be set')

        })
        test('unknown profile',()=>{
            const res= af.getAdapter({antProfile:'WGT'})
            expect(res).toBeUndefined()

        })
        test('unknown legacy profile',()=>{
            const res= af.getAdapter({incyclistProfile:'XX'})
            expect(res).toBeUndefined()
        })
    })


    describe('createInstance',()=>{

        let af;
        beforeEach( ()=>{
            af = new AntAdapterFactory()
            af.register('PWR', 'Power Meter', PWR)
            af.register('HR', 'Heartrate Monitor', HR )
            af.register('FE', 'Smart Trainer', FE)
        })

        test('existing profile',()=>{
            const res = af.createInstance({deviceID:1234,profile:'FE',interface:'ant'})
            expect(res).toBeDefined()
            expect(res.getID()).toBe('1234')
            expect(res.getProfileName()).toBe('FE')
        })

        test('non existing profile',()=>{
            const res = af.createInstance({deviceID:1234,profile:'WGT',interface:'ant'})
            expect(res).toBeUndefined()

        })
        test('legacy existing',()=>{
            const res = af.createInstance({deviceID:1234,profile:'Smart Trainer',protocol:'Ant',interface:'ant'})
            expect(res).toBeDefined()
            expect(res.getID()).toBe('1234')
            expect(res.getProfileName()).toBe('FE')

        })
        test('legacy non existing',()=>{
            const res = af.createInstance({deviceID:1234,profile:'Smart Scale',protocol:'Ant',interface:'ant'})
            expect(res).toBeUndefined()

        })

        test('error while calling constructor, will not be caught',()=>{
            class Crash extends FE { 
                getProfileName(): Profile {
                    return 'FE-X' as Profile
                }
            }
            af.register('FE','Smart Trainer',Crash)
            expect(()=>{ af.createInstance({deviceID:1234,profile:'FE',interface:'ant'})})
            .toThrow()
        })

        test('incorrect interface',()=>{            
            expect(()=>{ af.createInstance({deviceID:1234,profile:'FE',interface:'ble'})})
            .toThrow('Incorrect interface')
        })

        test('existing profile, including protocol',()=>{
            const res = af.createInstance({deviceID:1234,profile:'FE',interface:'ant',protocol:'Ant'})
            expect(res).toBeDefined()
            expect(res.getID()).toBe('1234')
            expect(res.getProfileName()).toBe('FE')
        })

        test('no profile specified',()=>{
            let res
            res = af.createInstance({deviceID:1234,interface:'ble', protocol:'Ant'})
            expect(res).toBeUndefined()
            res = af.createInstance({deviceID:1234,interface:'ble'})
            expect(res).toBeUndefined()
            
        })

    })
    describe('createFromDetected',()=>{
        let af;
        beforeEach( ()=>{
            af = new AntAdapterFactory()
            af.register('PWR', 'Power Meter', PWR)
            af.register('HR', 'Heartrate Monitor', HR )
            af.register('FE', 'Smart Trainer', FE)
        })

        test('existing profile',()=>{
            const res = af.createFromDetected('FE',1234,{user:{weight:75}})
            expect(res).toBeDefined()
            expect(res.getID()).toBe('1234')
            expect(res.getProfileName()).toBe('FE')
            expect(res.getWeight()).toBe(85) // user weight + 10kg bike
        })

        test('non existing profile',()=>{
            const res = af.createFromDetected({deviceID:1234,profile:'WGT',interface:'ant'})
            expect(res).toBeUndefined()

        })
      
    })
})