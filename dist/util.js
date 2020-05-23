"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const os = __importStar(require("os"));
const cp = __importStar(require("child_process"));
function applyMixins(derivedCtor, baseCtors) {
    baseCtors.forEach(baseCtor => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            Object.defineProperty(derivedCtor.prototype, name, Object.getOwnPropertyDescriptor(baseCtor.prototype, name));
        });
    });
}
exports.applyMixins = applyMixins;
function openForUser(thing) {
    if (os.type() == 'Windows_NT')
        cp.spawn('start');
    else if (os.type() == 'Darwin')
        cp.spawn('open', [thing]);
}
exports.openForUser = openForUser;
function bitValue(bit) {
    return (1 << (bit));
}
exports.bitValue = bitValue;
function arrayDiff(base, excl) {
    let cpy = Array.from(base);
    let ecpy = Array.from(excl);
    cpy.forEach(e => {
        let idx = ecpy.findIndex(k => k === e);
        if (idx != -1)
            ecpy.splice(idx, 1);
    });
    return ecpy;
}
exports.arrayDiff = arrayDiff;
//# sourceMappingURL=util.js.map