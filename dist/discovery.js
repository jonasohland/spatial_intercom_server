"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const dnssd = __importStar(require("dnssd"));
function getWebinterfaceAdvertiser(netif) {
    return new dnssd.Advertisement(dnssd.tcp('http'), 8090, { interface: netif, name: "Spatial Intercom Manager" });
}
exports.getWebinterfaceAdvertiser = getWebinterfaceAdvertiser;
function getServerAdvertiser(netif) {
    return new dnssd.Advertisement(dnssd.tcp('si-server'), 45045, { interface: netif });
}
exports.getServerAdvertiser = getServerAdvertiser;
function getServerBrowser(netif) {
    return new dnssd.Browser(dnssd.tcp('si-server'), { interface: netif });
}
exports.getServerBrowser = getServerBrowser;
//# sourceMappingURL=discovery.js.map