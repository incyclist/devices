"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var CyclingModeProperyType;
(function (CyclingModeProperyType) {
    CyclingModeProperyType["Integer"] = "Integer";
    CyclingModeProperyType["Boolean"] = "Boolean";
    CyclingModeProperyType["Float"] = "Float";
    CyclingModeProperyType["String"] = "String";
    CyclingModeProperyType["SingleSelect"] = "SingleSelect";
    CyclingModeProperyType["MultiSelect"] = "MultiSelect";
})(CyclingModeProperyType = exports.CyclingModeProperyType || (exports.CyclingModeProperyType = {}));
class CyclingModeBase {
    constructor(adapter, props) {
        this.settings = {};
        this.properties = {};
        if (!adapter)
            throw new Error('IllegalArgument: adapter is null');
        this.setAdapter(adapter);
        this.setSettings(props);
    }
    setAdapter(adapter) {
        this.adapter = adapter;
    }
    getBikeInitRequest() {
        return {};
    }
    getName() {
        throw new Error("Method not implemented.");
    }
    getDescription() {
        throw new Error("Method not implemented.");
    }
    sendBikeUpdate(request) {
        throw new Error("Method not implemented.");
    }
    updateData(data) {
        throw new Error("Method not implemented.");
    }
    getProperties() {
        throw new Error("Method not implemented.");
    }
    getProperty(name) {
        throw new Error("Method not implemented.");
    }
    setSettings(settings) {
        if (settings) {
            this.settings = settings;
        }
    }
    setSetting(name, value) {
        this.settings[name] = value;
    }
    getSetting(name) {
        const res = this.settings[name];
        if (res !== undefined)
            return res;
        const prop = this.getProperties().find(p => p.key === name);
        if (prop && prop.default !== undefined)
            return prop.default;
        return undefined;
    }
    getSettings() {
        return this.settings;
    }
    setModeProperty(name, value) {
        this.properties[name] = value;
    }
    getModeProperty(name) {
        const res = this.properties[name];
        if (res !== undefined)
            return res;
        const prop = this.getProperties().find(p => p.key === name);
        if (prop && prop.default !== undefined)
            return prop.default;
        return undefined;
    }
}
exports.CyclingModeBase = CyclingModeBase;
