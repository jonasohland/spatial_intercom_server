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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const serialport_1 = __importDefault(require("serialport"));
const Logger = __importStar(require("./log"));
const terminal_kit_1 = require("terminal-kit");
const chalk_1 = __importDefault(require("chalk"));
const usb_detection_1 = __importDefault(require("usb-detection"));
const util = __importStar(require("./util"));
const events_1 = require("events");
const headtracker_bridge_1 = require("./headtracker_bridge");
const log = Logger.get("BRIDGE");
const ulog = Logger.get("USBHST");
const { cyan } = chalk_1.default;
const findable_devices = [
    {
        vid: "6790",
        pid: "29987"
    }
];
class USBDetector extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this._cached_paths = [];
        this._devlist_refresh_cnt = 0;
    }
    start() {
        ulog.info("Looking for usb-serial devices...");
        usb_detection_1.default.startMonitoring();
        findable_devices.forEach(dev => {
            usb_detection_1.default.on(`add:${dev.vid}:${dev.pid}`, this._dev_found_retry.bind(this));
            usb_detection_1.default.on(`remove:${dev.vid}:${dev.pid}`, this._dev_remove.bind(this));
        });
        serialport_1.default.list().then((devs) => {
            this._cached_paths = devs.map(d => d.path);
            this._cached_paths.forEach(this._add_device.bind(this));
        });
    }
    _remove_device(path) {
        ulog.warn(path + " removed");
        this.emit('remove' + path);
    }
    _add_device(path) {
        let m = path.match(/usbserial|ttyUSB/g);
        if (!m || m.length != 1)
            return;
        ulog.info("Found new device: " + path);
        this.emit('add', path);
    }
    _dev_found_retry(dev) {
        return __awaiter(this, void 0, void 0, function* () {
            if (++this._devlist_refresh_cnt >= 10)
                return ulog.error("Could not register new device");
            let paths = (yield serialport_1.default.list()).map(l => l.path);
            let diff = util.arrayDiff(this._cached_paths, paths);
            if (!(diff.length))
                return setTimeout(this._dev_found_retry.bind(this, dev), 200);
            diff.forEach(this._add_device.bind(this));
            this._devlist_refresh_cnt = 0;
            this._cached_paths = paths;
        });
    }
    _dev_remove(dev) {
        return __awaiter(this, void 0, void 0, function* () {
            let paths = (yield serialport_1.default.list()).map(l => l.path);
            let diff = util.arrayDiff(paths, this._cached_paths);
            diff.forEach(this._remove_device.bind(this));
            this._cached_paths = paths;
        });
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
function start(path, options) {
    log.info("Opening port " + path);
    let p = new serialport_1.default(path, { autoOpen: false, baudRate: 115200 });
    p.on('open', err => {
        log.info("Port is now open");
        if (err) {
            log.error(`Could not open port ${path}, error: ${err.message}`);
            exit(20);
        }
    });
    p.open();
}
function default_1(port, options) {
    return __awaiter(this, void 0, void 0, function* () {
        if (options.listPorts)
            return listPorts().then(exit);
        const bridge = new headtracker_bridge_1.HeadtrackerBridge();
        if (!port) {
            if (options.auto) {
                let detect = new USBDetector();
                detect.on('add', bridge.addDevice.bind(bridge));
                detect.on('remove', bridge.removeDevice.bind(bridge));
                detect.start();
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
//# sourceMappingURL=headtracker_bridge_mode.js.map