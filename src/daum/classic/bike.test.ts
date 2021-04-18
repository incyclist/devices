import Bike from './bike'
describe( 'bike',()=> {

    describe( 'setPerson',()=> {

        let bike;
        beforeEach( ()=> {
            bike = new Bike();
        })

        test('default user data',async ()=>{
            bike.sendDaum8008Command = jest.fn();    
            bike.setPerson() ;
            expect(bike.sendDaum8008Command).toBeCalledWith( "setPerson(0,30,2,180,90)", [0x24, 0, 0, 30, 2, 180, 90, 0, 0, 3, 160, 0, 0, 0, 0],16, expect.anything(), expect.anything())
        })

        test('user: 75kg, 170cm',async ()=>{
            bike.sendDaum8008Command = jest.fn();    
            bike.setPerson({weight:75,length:170}) ;
            expect(bike.sendDaum8008Command).toBeCalledWith( "setPerson(0,30,2,170,85)", [0x24, 0, 0, 30, 2, 170, 85, 0, 0, 3, 160, 0, 0, 0, 0],16, expect.anything(), expect.anything())
        })

    })

})