import DeviceProtocolBase,{DeviceProtocol} from './DeviceProtocol'

let _protocols = [];

export default class DeviceRegistry {

    // reserved for tests
    static _reset() {
        _protocols = [];
    }

    // reserved for tests
    static _get() {
        return _protocols;
    }

    static register(protocol: DeviceProtocol) { 
        if (!protocol)
            return;
        const idx = _protocols.findIndex( d => d.getName()===protocol.getName());
        if (idx!==-1) {
            _protocols[idx] = protocol;
        } 
        else {
            _protocols.push(protocol)
        }
    }

    static findByName(name:string): DeviceProtocol {
        if (!name)
            return;
        return _protocols.find( d => d.getName()===name);
    }

    static findByInterface(interf:string): Array<DeviceProtocol> {
        if (!interf)
            return;
        return _protocols.filter( d => 
            d.getInterfaces().findIndex(i => i===interf)!==-1);
    }    
}
