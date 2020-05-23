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
const dnssd = __importStar(require("dnssd"));
const dgram_1 = __importDefault(require("dgram"));
const headtracker_1 = require("./headtracker");
const showfiles_1 = require("./showfiles");
class HeadtrackerBridge {
    constructor() {
        this._adv = new dnssd.Advertisement(dnssd.udp('_htrk'), 5697, { host: 'si_htrk_01' });
        this._adv.start();
        this._sock = dgram_1.default.createSocket('udp4');
        this._sock.bind(5697);
        this._sock.on('message', this._on_message.bind(this));
        this._sock.on('listening', this._on_listen.bind(this));
        this._sock.on('close', this._on_close.bind(this));
        this._sock.on('error', this._on_error.bind(this));
    }
    _on_listen() {
    }
    _on_message(msg, rinfo) {
        if (!headtracker_1.HeadtrackerConfigPacket.check(msg))
            return;
        this._remote = rinfo;
    }
    _on_close() {
    }
    _on_error(err) {
    }
}
function default_1() {
    new HeadtrackerBridge();
    let man = new showfiles_1.ShowfileManager();
}
exports.default = default_1;
//# sourceMappingURL=htrk_bridge_mode.js.map