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
const dnssd = __importStar(require("dnssd"));
const serialport_1 = __importDefault(require("serialport"));
const headtracker_1 = require("./headtracker");
const headtracker_serial_1 = require("./headtracker_serial");
const Logger = __importStar(require("./log"));
const events_1 = require("events");
const log = Logger.get('BRIDGE');
class SIOutputAdapter extends headtracker_serial_1.UDPOutputAdapter {
    constructor() {
        super(...arguments);
        this.id = 0;
    }
    process(q) {
        let { buffer, offset } = q.data();
        if (q.float())
            this.sendData(headtracker_1.HeadtrackerDataPacket.newPacketFromFloatLEData(buffer, offset, this.id));
        else
            this.sendData(headtracker_1.HeadtrackerDataPacket.newPackerFromInt16Data(buffer, offset, this.id));
    }
}
class HeadtrackerBridgeDevice extends events_1.EventEmitter {
    constructor(port) {
        super();
        this.path = port.path;
        this.output = new SIOutputAdapter();
        this.lhtrk = new headtracker_serial_1.LocalHeadtracker(port, this.output);
        this.lhtrk.on('close', (err) => {
            log.warn("Headtracker closed");
            this.emit('close');
        });
        this.output.setRemote('127.0.0.1', 9999);
        this._adv = new dnssd.Advertisement(dnssd.udp('_htrk'), 5697, { host: 'si_htrk_01' });
        this._adv.start();
    }
    reconnect(port) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.lhtrk.destroy();
            this.lhtrk = new headtracker_serial_1.LocalHeadtracker(port, this.output);
        });
    }
    destroy() {
        this.lhtrk.destroy().catch((err) => {
            log.warn("Could not close port: " + err);
        });
    }
}
exports.HeadtrackerBridgeDevice = HeadtrackerBridgeDevice;
class HeadtrackerBridge {
    constructor() {
        this._devs = [];
    }
    findDeviceForPath(p) {
        return this._devs.find(d => d.path === p);
    }
    addDevice(p) {
        log.info('Opening port ' + p);
        let odev = this.findDeviceForPath(p);
        if (odev)
            return log.error('Device ' + p
                + ' already opened. Not trying to open again. That would be pointless.');
        let newdev = new HeadtrackerBridgeDevice(new serialport_1.default(p, { baudRate: 115200, autoOpen: false }));
        this._devs.push(newdev);
        newdev.on('close', this.removeDevice.bind(this, p));
    }
    removeDevice(p) {
        let dev = this.findDeviceForPath(p);
        if (!dev)
            return;
        dev.destroy();
        log.info('Closing port and deregistering device at ' + p);
        this._devs.splice(this._devs.indexOf(dev), 1);
    }
}
exports.HeadtrackerBridge = HeadtrackerBridge;
//# sourceMappingURL=headtracker_bridge.js.map