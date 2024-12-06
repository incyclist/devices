"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const config = fs_1.default.readFileSync('./tsconfig.json', 'utf8');
console.log(config);
//# sourceMappingURL=index.js.map