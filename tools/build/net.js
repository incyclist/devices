"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAddress = void 0;
const os_1 = require("os");
const getAddress = () => {
    const nets = (0, os_1.networkInterfaces)();
    const keys = Object.keys(nets);
    const found = [];
    keys.forEach(key => {
        const ni = nets[key].filter(n => n.family === 'IPv4' && !n.internal)[0];
        if (ni)
            found.push(ni);
    });
    return found[0];
};
exports.getAddress = getAddress;
//# sourceMappingURL=net.js.map