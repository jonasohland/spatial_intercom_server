"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = __importDefault(require("chalk"));
const winston_1 = __importDefault(require("winston"));
const winston_transport_1 = __importDefault(require("winston-transport"));
const cformat = winston_1.default.format.printf(({ level, message, label, timestamp }) => {
    let c;
    switch (level) {
        case 'error':
            c = chalk_1.default.red;
            break;
        case 'warn':
            c = chalk_1.default.yellow;
            break;
        case 'info':
            c = chalk_1.default.cyan;
            break;
        default:
            c = (str) => str;
            break;
    }
    return `[${c(label)}] ${new Date(timestamp).toLocaleTimeString()}: ${message}`;
});
class RemoteConsoleTransport extends winston_transport_1.default {
    constructor() {
        super();
        this.setMaxListeners(20);
    }
    attach(s) {
        this.server = s;
        this.server.on('connection', socket => {
            socket.on('log.request', () => {
            });
        });
        this.server.sockets.emit('log.attached');
    }
    log(info, callback) {
        if (this.server)
            this.server.sockets.emit('global_log', {
                message: info[Symbol.for('message')],
                level: info[Symbol.for('level')]
            });
        callback();
    }
}
exports.rct = new RemoteConsoleTransport();
function get(module_name) {
    return winston_1.default.createLogger({
        format: winston_1.default.format.combine(winston_1.default.format.label({ label: module_name }), winston_1.default.format.timestamp(), cformat),
        transports: [new winston_1.default.transports.Console({ level: 'verbose' }), exports.rct]
    });
}
exports.get = get;
//# sourceMappingURL=log.js.map