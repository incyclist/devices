import DeviceRegistry from './DeviceRegistry';
import Device from './Device';
import DeviceProtocol, { INTERFACE } from './DeviceProtocol';
import SimulatorProtocol from './simulator/Simulator';
import DaumPremiumProtocol from './daum/premium/DaumPremiumProtocol';
import DaumClassicProtocol from './daum/classic/DaumClassicProtocol';
import { AntScanner } from './ant/AntScanner';
declare const Protocols: {
    SimulatorProtocol: typeof SimulatorProtocol;
    DaumClassicProtocol: typeof DaumClassicProtocol;
    DaumPremiumProtocol: typeof DaumPremiumProtocol;
};
export { DeviceProtocol, DeviceRegistry, INTERFACE, Device, Protocols, AntScanner, };
