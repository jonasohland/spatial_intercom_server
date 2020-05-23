"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mid = __importStar(require("node-machine-id"));
const os = __importStar(require("os"));
const socket_io_client_1 = __importDefault(require("socket.io-client"));
const discovery = __importStar(require("./discovery"));
const IPC = __importStar(require("./ipc"));
const server_config = __importStar(require("./server_config"));
const local_addresses = [];
const ifaces = os.networkInterfaces();
Object.keys(ifaces).forEach(function (ifname) {
    var alias = 0;
    ifaces[ifname].forEach(function (iface) {
        if ('IPv4' != iface.family || iface.internal)
            return;
        local_addresses.push(iface.address);
        ++alias;
    });
});
function default_1(options) {
    server_config.loadServerConfigFile();
    let ipc_bridge;
    let socket;
    const config = server_config.merge(options);
    const browser = discovery.getServerBrowser(config.interface);
    browser.on('serviceUp', (service) => {
        let serveraddr = `ws://${service.addresses[0]}:${service.port}`;
        socket = socket_io_client_1.default(serveraddr, { reconnectionDelayMax: 1000 });
        socket.on('__name', () => {
            let id = mid.machineIdSync();
            socket.emit('__name', os.hostname(), id, local_addresses);
        });
        ipc_bridge = new IPC.IPCBridge(socket, serveraddr, 'default');
    });
    browser.start();
}
exports.default = default_1;
//# sourceMappingURL=node_mode.js.map