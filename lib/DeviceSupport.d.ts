import DeviceRegistry from './DeviceRegistry';
import DeviceAdapter from './Device';
import DeviceProtocolBase, { INTERFACE, DeviceProtocol } from './DeviceProtocol';
import SimulatorProtocol from './simulator/Simulator';
import DaumPremiumProtocol from './daum/premium/DaumPremiumProtocol';
import DaumClassicProtocol from './daum/classic/DaumClassicProtocol';
import { AntScanner } from './ant/AntScanner';
import { CyclingModeProperyType } from './CyclingMode';
declare const Protocols: {
    SimulatorProtocol: typeof SimulatorProtocol;
    DaumClassicProtocol: typeof DaumClassicProtocol;
    DaumPremiumProtocol: typeof DaumPremiumProtocol;
};
export { DeviceProtocolBase, DeviceProtocol, DeviceRegistry, INTERFACE, DeviceAdapter as Device, Protocols, AntScanner, CyclingModeProperyType };
