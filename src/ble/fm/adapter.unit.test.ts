import BleFmAdapter from './adapter'
describe('BleFmAdapter',()=>{
    describe('isEqual',()=>{
        test('name only equal',()=>{
            const A = new BleFmAdapter({interface:'ble', name:'1', protocol:'fm'})
            const res = A.isEqual({interface:'ble', name:'1', protocol:'fm'})
            expect(res).toBeTruthy()
        }) 
        test('name only not equal',()=>{
            const A = new BleFmAdapter({interface:'ble', name:'1', protocol:'fm'})
            const res = A.isEqual({interface:'ble', name:'2', protocol:'fm'})
            expect(res).toBeFalsy()
        }) 
        test('name and address - one is equal',()=>{
            const A = new BleFmAdapter({interface:'ble', name:'1',address:'1111', protocol:'fm'})
            const res = A.isEqual({interface:'ble', name:'2',address:'1111', protocol:'fm'})
            expect(res).toBeTruthy()
        }) 
    
    })    
})