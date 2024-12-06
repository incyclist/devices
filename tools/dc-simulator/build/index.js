"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const net_1 = require("net");
const bonjour_service_1 = require("bonjour-service");
const comms_1 = require("./comms");
const emulator_1 = require("./emulator");
const main = (_a) => __awaiter(void 0, [_a], void 0, function* ({ configFile = './config/kickr-bike.json' }) {
    const emulator = new emulator_1.Emulator({ name: 'VOLT 2A34', frequency: 1000, disableCps: true });
    const config = yield (0, config_1.prepareConfig)(configFile, emulator.name, emulator.getServices().map(s => s.uuid));
    const { address } = config.referer;
    const serverCallbacks = (socket) => {
        const services = emulator.getServices();
        return new comms_1.DirectConnectComms(socket, services);
    };
    const start = (a, p) => {
        console.log('start', a, p);
        const server = (0, net_1.createServer)(serverCallbacks);
        console.log('start emulator');
        emulator.start();
        setTimeout(simulate, 3000);
        server.on('error', (err) => { console.log('ERROR', err); });
        server.on('connection', (conn) => { console.log('CONNECTION', conn.address()); });
        server.on('listening', () => { console.log(`listening on ${a}:${p}`); });
        server.listen(p, a);
    };
    const simulate = () => {
        setInterval(() => {
            emulator.update({ power: Math.round(Math.random() * 100 + 50), heartrate: Math.round(Math.random() * 40 + 80), cadence: Math.round(Math.random() * 20 + 80) });
        }, 1000);
    };
    start(address, config.port);
    const instance = new bonjour_service_1.Bonjour();
    instance.publish(config);
});
const parseArgs = () => {
    const args = process.argv.slice(2);
    const configFile = args[0];
    return { configFile };
};
main(parseArgs());
//# sourceMappingURL=index.js.map