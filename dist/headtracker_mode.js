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
const headtracking_1 = require("./headtracking");
const Logger = __importStar(require("./log"));
const serialport_1 = __importDefault(require("serialport"));
const terminal_kit_1 = require("terminal-kit");
const chalk_1 = __importDefault(require("chalk"));
const headtracker_serial_1 = require("./headtracker_serial");
const { cyan } = chalk_1.default;
const log = Logger.get('HEADTR');
const socket_io_1 = __importDefault(require("socket.io"));
const htrk_devices = [];
class DummyOutputAdapter extends headtracker_serial_1.OutputAdapter {
    process(q) {
        console.log(q);
    }
}
function findPort(index) {
    return __awaiter(this, void 0, void 0, function* () {
        return serialport_1.default.list().then(ports => {
            if (ports.length < index || index < 1) {
                log.error("No port found for index " + index);
                exit(1);
            }
            else
                return ports[index - 1].path;
        });
    });
}
function exit(code) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(typeof code == 'number'))
            code = 0;
        terminal_kit_1.terminal.processExit(code);
    });
}
terminal_kit_1.terminal.on('key', (name) => {
    if (name === 'CTRL_C')
        exit(0);
});
function listPorts() {
    return __awaiter(this, void 0, void 0, function* () {
        return serialport_1.default.list().then(ports => {
            console.log("The following serial ports are available on your device [index] - [port]:");
            console.log();
            ports.forEach((p, i) => {
                console.log(`${cyan('' + (i + 1))} - ${p.path}`);
            });
        });
    });
}
function selectPort() {
    return __awaiter(this, void 0, void 0, function* () {
        return serialport_1.default.list().then(ports => {
            return terminal_kit_1.terminal.singleColumnMenu(ports.map(p => p.path)).promise
                .then(res => {
                console.log();
                return res.selectedText;
            });
        });
    });
}
function runFlashMode(p, options) {
    let htrk = new headtracker_serial_1.LocalHeadtracker(p, new DummyOutputAdapter());
    htrk.on('ready', () => {
        htrk.flashNewestFirmware(options.bootloader).then(() => {
            exit(0);
        }).catch(err => {
            exit(1);
        });
    });
}
function runLatencyTest(p, options) {
    let htrk = new headtracker_serial_1.LocalHeadtracker(p, new DummyOutputAdapter());
    htrk.on('ready', () => {
        htrk.checkLatency().then(() => {
            exit();
        });
    });
}
function runNormalMode(p, options) {
    let wss = socket_io_1.default(45040);
    let headtracking = new headtracking_1.Headtracking(8887, wss);
    let adapter;
    if (options.preset) {
        if (options.preset == 'IEM') {
            adapter = new headtracker_serial_1.IEMOutputAdapter();
        }
        else {
            log.error("Preset " + options.preset + " not found");
            exit(1);
        }
    }
    else
        adapter = new headtracker_serial_1.OSCOutputAdapter();
    if (options.format == 'euler') {
        adapter.setOutputQuaternions(false);
        adapter.setOutputEuler(true);
    }
    else {
        adapter.setOutputQuaternions(true);
        adapter.setOutputEuler(false);
    }
    adapter.setRemote(options.host, options.port);
    if (!(options.preset)) {
        if (options.quaternionAddr) {
            let addrs = options.quaternionAddr.split(",");
            adapter.setQuatAddresses(addrs);
        }
        if (options.eulerAddr) {
            let addrs = options.eulerAddr.split(",");
            adapter.setEulerAddresses(addrs);
        }
    }
    headtracking.addHeadtracker(new headtracker_serial_1.LocalHeadtracker(p, adapter), 99, "local");
}
function start(path, options) {
    log.info("Opening port " + path);
    let p = new serialport_1.default(path, { autoOpen: false, baudRate: 115200 });
    p.on('open', err => {
        log.info("Port is now open");
        if (err) {
            log.error(`Could not open port ${path}, error: ${err.message}`);
            exit(1);
        }
        if (options.flashFirmware)
            return runFlashMode(p, options);
        if (options.testLatency)
            return runLatencyTest(p, options);
        runNormalMode(p, options);
    });
    p.open();
}
function default_1(port, options) {
    return __awaiter(this, void 0, void 0, function* () {
        if (options.listPorts)
            return listPorts().then(exit);
        if (!port) {
            if (options.auto) {
                return;
            }
            else {
                console.log("Please select a serial port (↑↓, Enter to confirm): ");
                return selectPort().then(port => start(port, options)).catch(err => {
                    log.error("Could not select serial port " + err);
                    exit(1);
                });
            }
        }
        let p_i = Number.parseInt(port);
        if (!isNaN(p_i))
            port = yield findPort(p_i);
        start(port, options);
    });
}
exports.default = default_1;
//# sourceMappingURL=headtracker_mode.js.map