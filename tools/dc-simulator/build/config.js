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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareConfig = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const net_1 = require("./net");
const os_1 = require("os");
const incyclist_devices_1 = require("incyclist-devices");
const createRawText = (txt) => {
    const buffer = Buffer.from(txt, 'utf8');
    return buffer;
};
const prepareConfig = (file, name, uuids) => __awaiter(void 0, void 0, void 0, function* () {
    const config = yield promises_1.default.readFile(file, 'utf8');
    const json = JSON.parse(config);
    const target = JSON.parse(JSON.stringify(json));
    const { address, mac } = (0, net_1.getAddress)();
    target.addresses = [address];
    target.referer.address = address;
    target.txt['mac-address'] = mac.toUpperCase().replace(/:/g, '-');
    target.host = `${(0, os_1.hostname)()}.local`;
    target.name = name;
    target.fqdn = `${name}._wahoo-fitness-tnp._tcp.local`;
    target.txt['ble-service-uuids'] = uuids.map(s => (0, incyclist_devices_1.beautifyUUID)(s, true)).join(',');
    console.log(config, "\n", target);
    target.rawTxt = [];
    const keys = Object.keys(target.txt);
    keys.forEach((key) => {
        const txt = `${key}=${target.txt[key]}`;
        target.rawTxt.push(createRawText(txt));
    });
    return target;
});
exports.prepareConfig = prepareConfig;
//# sourceMappingURL=config.js.map