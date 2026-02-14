import type { CadenceSensor } from 'incyclist-ant-plus'
import { LegacyProfile } from './types'
import { getBrand, mapLegacyProfile } from './utils'

describe ( 'utils',()=>{
    describe('getBrand',()=>{
        test('invalid ID',()=>{
            const res = getBrand(0)
            expect(res).toBeUndefined()
        })

        test('known Ids',()=>{
            const brands:any[] = []
            const ids = [1,16,23,52,53,70,123,287,32,86,89]
            ids.forEach( id=> brands.push(getBrand(id)))                
            expect(brands).toMatchSnapshot()
        })

        test('All IDs until 287',()=>{
            const brands:any[] = []
            for (let i=0;i<287;i++) 
                brands.push(getBrand(i++))
            expect(brands).toMatchSnapshot()
        })

    })

    describe('mapLegacyProfile',()=>{

        test('default',()=>{
            const profiles: Array<LegacyProfile> = [
                'Heartrate Monitor', 'Power Meter', 'Smart Trainer', 
                'Cadence Sensor','Speed Sensor','Speed + Cadence Sensor'
            ]

            const res = profiles.map( p=>mapLegacyProfile(p) )
            expect(res).toMatchSnapshot()

        })

    })
})