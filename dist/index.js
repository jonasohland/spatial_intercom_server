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
const commander = __importStar(require("commander"));
const node_mode_1 = __importDefault(require("./node_mode"));
const server_mode_1 = __importDefault(require("./server_mode"));
const headtracker_mode_1 = __importDefault(require("./headtracker_mode"));
const headtracker_bridge_mode_1 = __importDefault(require("./headtracker_bridge_mode"));
const program = new commander.Command();
program.version('0.0.1');
program.command('server')
    .option('-i, --interface <interface>', 'use this network interface')
    .option('-w, --web-interface <interface>')
    .option('-n, --node-name <node name>')
    .option('-p, --port <port>')
    .option('-z, --webserver-port <port>')
    .option('--no-webserver')
    .action(server_mode_1.default);
program.command('node')
    .option('-i, --interface <interface>', 'use this network interface')
    .option('-n, --node-name <node name>')
    .option('-p, --port <port>')
    .action(node_mode_1.default);
program.command('headtracker [serialport]')
    .option('-L, --list-ports', 'Just list the serial ports and exit')
    .option('-F, --flash-firmware', 'Flash the newest firmware to the headtracker.')
    .option('-B, --bootloader <bootloader>', 'Target bootloader version (old/new)', 'old')
    .option('-T, --test-latency', 'test latency and exit')
    .option('-a, --auto', 'Find headtracker(s) on this system automatically (may be unreliable)')
    .option('-h, --host <host>', 'Send data to this host', '127.0.0.1')
    .option('-p, --port <port>', 'Send data to this port', 8886)
    .option('-s, --sample-rate', 'specify sample rate')
    .option('-A, --auto-start', 'start sending packets immediately')
    .option('-f, --format <format>', 'Output format (euler/quaternion).', 'quaternion')
    // .option('-u, --units <unit>', 'Output units (deg/rad)', 'rad')
    // .option('-i, --invert <x/y/z>', 'Invert these rotation axises. Example: --invert xz')
    // .option('-w, --webserver-port', 'serve the webinterface to this port')
    .option('-S, --slow-start')
    .option('-P, --preset <preset>', 'Output format preset. Available: IEM', 'IEM')
    .option('--quaternion-addr <addresses>', 'Specify osc output addresses for Quaternion output. Requires 4 comma-sepatated values.', "/q/w,/q/x,/q/y,/q/z")
    .option('--euler-addr <yaw> <pitch> <roll>', 'Specify osc output addresses for Euler angle output. Requires 3 comma-sepatated values.', "/e/y,/e/p,/e/r")
    .action(headtracker_mode_1.default);
program.command('htrk-bridge [serialport]')
    .option('-l, --list-ports', 'Just list the serial ports and exit')
    .option('-a, --auto', 'Find headtracker(s) on this system automatically (may be unreliable)')
    .option('-p, --port')
    .option('-i, --interface')
    .option('--syslog', 'Run in syslog mode. This will remove redundant date/time from log output.')
    .option('-s, --slow-start')
    .action(headtracker_bridge_mode_1.default);
program.parse(process.argv);
//# sourceMappingURL=index.js.map