import {DeviceProtocol} from './DeviceProtocol';
import DeviceRegistry from './DeviceRegistry'

describe ( 'DeviceRegistry' ,()=>{

    describe ( 'register',()=> {
        beforeEach( ()=> {
            DeviceRegistry._reset();
        })

        test('single object',()=>{
            class A  {
                marker:string;
                getName() { return 'A'}
            }
            DeviceRegistry.register(new A() as unknown as DeviceProtocol)
            const r =DeviceRegistry._get(); 
            expect(r.length).toBe(1);
            expect(r[0].getName()).toBe('A');
        })


        test('multiple different objects',()=>{
            class A  { getName() { return 'A'} }
            class B  { getName() { return 'B'} }
            class C  { getName() { return 'C'} }

            DeviceRegistry.register(new A() as unknown as DeviceProtocol)
            DeviceRegistry.register(new B() as unknown as DeviceProtocol)
            DeviceRegistry.register(new C() as unknown as DeviceProtocol)
            const r =DeviceRegistry._get(); 
            expect(r.length).toBe(3);
            expect(r[0].getName()).toBe('A');
            expect(r[1].getName()).toBe('B');
            expect(r[2].getName()).toBe('C');
        })


        test('same object type twice',()=>{
            class A  { marker: string; getName() { return 'A'} }
            class B  { getName() { return 'B'} }
            const a1 = new A();
            const a2 = new A();
            a1.marker = 'a1';
            a2.marker = 'a2';

            DeviceRegistry.register(a1 as unknown as DeviceProtocol)
            DeviceRegistry.register(new B() as unknown as DeviceProtocol)
            DeviceRegistry.register(a2 as unknown as DeviceProtocol)
            const r =DeviceRegistry._get(); 
            expect(r.length).toBe(2);
            expect(r[0].getName()).toBe('A');
            expect(r[1].getName()).toBe('B');
            expect(r[0].marker).toBe('a2');
        })

        test('device= undefined',()=>{
            class A  {
                getName() { return 'A'}
            }
            DeviceRegistry.register(new A() as unknown as DeviceProtocol)
            DeviceRegistry.register(undefined)

            const r =DeviceRegistry._get(); 
            expect(r.length).toBe(1);
            expect(r[0].getName()).toBe('A');
        })


    })

    describe ( 'findByName',()=> {

        class A  { 
            marker:string;
            constructor(m) { this.marker=m} 
            getName() { return 'A'} 
        }
        class B extends A { getName() { return 'B'} }
        class C extends A { getName() { return 'C'} }
    
        beforeEach( ()=> {
            DeviceRegistry._reset();
            
            DeviceRegistry.register(new A('1') as unknown as DeviceProtocol)
            DeviceRegistry.register(new B('2') as unknown as DeviceProtocol)
            DeviceRegistry.register(new C('3') as unknown as DeviceProtocol)
        })

        test( 'successfull search',()=> {
            const res = DeviceRegistry.findByName('B') as any;
            expect(res.marker).toBe('2')
        })

        test( 'device not existing',()=> {
            const res = DeviceRegistry.findByName('X')
            expect(res).toBeUndefined()
        })

        test( 'name=undefined',()=> {
            const res = DeviceRegistry.findByName(undefined)
            expect(res).toBeUndefined()
        })

        
    })

    describe ( 'findByInterface',()=> {

        beforeEach( ()=> {
            DeviceRegistry._reset();
            class A  { 
                interfaces: any;
                constructor(i) { this.interfaces=i}
                getInterfaces() { return this.interfaces} 
                getName() { return 'A'} 
            }
            class B extends A { getName() { return 'B'} }
            class C extends A { getName() { return 'C'} }
            
            DeviceRegistry.register(new A(['ant','serial','tcpip']) as unknown as DeviceProtocol)
            DeviceRegistry.register(new B(['ant']) as unknown as DeviceProtocol)
            DeviceRegistry.register(new C(['serial']) as unknown as DeviceProtocol)
        })
  
        test( 'interface only available in one device',()=> {
            const res = DeviceRegistry.findByInterface('tcpip')
            expect(res.length).toBe(1)
            expect(res[0].getName()).toBe('A')
        })

        test( 'interface only available in one device',()=> {
            const res = DeviceRegistry.findByInterface('ant')
            expect(res.length).toBe(2)
            expect(res[0].getName()).toBe('A')
            expect(res[1].getName()).toBe('B')
        })

        test( 'interface not found',()=> {
            const res = DeviceRegistry.findByInterface('my special')
            expect(res.length).toBe(0);
        })

        test( 'interface=undefined',()=> {
            const res = DeviceRegistry.findByInterface(undefined)
            expect(res).toBeUndefined()
        })

    })

})