"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const dgram_1 = require("dgram");
const Logger = __importStar(require("./log"));
const log = Logger.get('HTK');
const headtracker_1 = require("./headtracker");
var HTRKDevState;
(function (HTRKDevState) {
    HTRKDevState[HTRKDevState["INITIALIZING"] = 0] = "INITIALIZING";
    HTRKDevState[HTRKDevState["CONNECTED"] = 1] = "CONNECTED";
    HTRKDevState[HTRKDevState["CONNECTING"] = 2] = "CONNECTING";
    HTRKDevState[HTRKDevState["BUSY"] = 3] = "BUSY";
    HTRKDevState[HTRKDevState["TIMEOUT"] = 4] = "TIMEOUT";
    HTRKDevState[HTRKDevState["ID_CONFLICT"] = 5] = "ID_CONFLICT";
    HTRKDevState[HTRKDevState["DISCONNECTED"] = 6] = "DISCONNECTED";
})(HTRKDevState || (HTRKDevState = {}));
var HTRKMsgState;
(function (HTRKMsgState) {
    HTRKMsgState[HTRKMsgState["WAITING"] = 0] = "WAITING";
    HTRKMsgState[HTRKMsgState["SAVING"] = 1] = "SAVING";
    HTRKMsgState[HTRKMsgState["READY"] = 2] = "READY";
})(HTRKMsgState || (HTRKMsgState = {}));
class NetworkHeadtracker extends headtracker_1.Headtracker {
    constructor(server, id, addr, port, local_port, netif) {
        super();
        this.remote = {};
        this.local = {};
        this._setState(HTRKDevState.DISCONNECTED);
        this.remote.addr = addr;
        this.remote.port = port;
        this.remote.id = id;
        this.dumping = false;
        this.local.port = local_port;
        this.local.netif = netif;
        this.socket = dgram_1.createSocket('udp4');
        this.server = server;
        this.socket.on('close', this._onClose.bind(this));
        this.socket.on('error', this._onError.bind(this));
        this.socket.on('listening', this._onListening.bind(this));
        this.socket.on('message', this._onMessage.bind(this));
        log.info(`Created new headtracking unit #${this.remote.id}`);
    }
    _onClose() {
        this._setState(HTRKDevState.DISCONNECTED);
        log.info(`Socket closed for device #${this.remote.id}`);
    }
    _onError(e) {
        this._setState(HTRKDevState.DISCONNECTED);
        log.error(e);
    }
    _onListening() {
        if (this._state(HTRKDevState.CONNECTING)) {
            log.info(`Listening for headtracking unit #${this.remote.id} on port ${this.remote.port}`);
            this.response_timeout
                = setTimeout(this._onResponseTimeout.bind(this), 2000);
            this._setState(HTRKDevState.INITIALIZING);
            this._sendDataDumpRequest();
        }
    }
    _onMessage(m) {
        // this is a regular status update
        if (headtracker_1.HeadtrackerConfigPacket.check(m)) {
            clearTimeout(this.response_timeout);
            let p = headtracker_1.HeadtrackerConfigPacket.fromBuffer(m);
            if (this.resetting_orientation) {
                if (!p.isStateFlagSet(headtracker_1.HeadtrackerStateFlags.RESET_ORIENTATION)) {
                    log.info('Orientation reset on Headtracker '
                        + p.deviceID());
                    this.resetting_orientation = false;
                }
            }
            if (this._state() == HTRKDevState.TIMEOUT) {
                this.server.emit('htrk.reconnected', p.deviceID());
                log.info(`Headtracker ${p.deviceID()} reconnected`);
                this._setState(HTRKDevState.BUSY);
                this._updateRemote();
                return this._askAliveLater();
            }
            if (p.isDeviceFlagSet(headtracker_1.HeadtrackerConfigFlags.UPDATE)) {
                log.info('Configuration saved to headtracking unit');
                this.local.conf = p;
                this.remote.conf = p;
                this.local.conf.clearDeviceFlag(headtracker_1.HeadtrackerConfigFlags.UPDATE);
                /**
                 * The current configuration was saved to the device
                 * @event Headtracker#saved
                 */
                this.server.emit('htrk.saved', this.remote.conf.deviceID());
                this._updateRemote();
                return this._updateDeviceNow();
            }
            if (p.isDeviceFlagSet(headtracker_1.HeadtrackerConfigFlags.NON_REQUEST))
                return this._handleStateUpdate(p, false);
            if (this._state(HTRKDevState.INITIALIZING)) {
                this.remote.conf = p;
                this.local.conf = p;
                this._setState(HTRKDevState.CONNECTED);
                this._updateRemote();
                this._askAliveLater();
                return;
            }
            if (this._state(HTRKDevState.BUSY)) {
                this._setState(HTRKDevState.CONNECTED);
                this._handleStateUpdate(p, true);
                if (this.update_required)
                    this._updateDevice();
                else
                    this._askAliveLater();
            }
        }
    }
    _onResponseTimeout() {
        if (this._state() != HTRKDevState.TIMEOUT) {
            log.info('Headtracking unit timed out');
            this._setState(HTRKDevState.TIMEOUT);
            this.server.emit('htrk.disconnected', (this.remote.conf) ? this.remote.conf.deviceID() : 'unknown');
            this._updateRemote();
        }
        this.response_timeout
            = setTimeout(this._onResponseTimeout.bind(this), 2000);
        this._sendDataDumpRequest();
    }
    _connect() {
        if (this._state(HTRKDevState.CONNECTED))
            return;
        log.info(`Binding socket to ${this.local.netif}:${this.local.port}`);
        this._setState(HTRKDevState.CONNECTING);
        this.socket.bind(this.local.port, this.local.netif);
    }
    _disconnect() {
        this._setState(HTRKDevState.DISCONNECTED);
        if (this.socket)
            this.socket.close();
    }
    _handleStateUpdate(m, is_req) {
        if (!is_req) {
            if (m.device_state != this.remote.conf.device_state) {
                let msg = {
                    id: this.remote.conf.deviceID(),
                    prs: m.isStateFlagSet(headtracker_1.HeadtrackerStateFlags.GY_PRESENT),
                    rdy: m.isStateFlagSet(headtracker_1.HeadtrackerStateFlags.GY_RDY)
                };
                this.server.emit('htrk.gyro.changed', msg);
            }
        }
        this.remote.conf = m;
        log.silly(`Handling ${is_req ? 'requested ' : ''}state update`);
        if (!this.update_required)
            this.local.conf = m;
        if (!is_req)
            this._updateRemote();
    }
    _askStillAlive() {
        clearTimeout(this.response_timeout);
        this.response_timeout
            = setTimeout(this._onResponseTimeout.bind(this), 2000);
        this._setState(HTRKDevState.BUSY);
        this._sendDataDumpRequest();
    }
    _askAliveLater() {
        clearTimeout(this.check_alive_timeout);
        this.check_alive_timeout
            = setTimeout(this._askStillAlive.bind(this), 5000);
    }
    _updateDevice() {
        if (!this._state(HTRKDevState.CONNECTED))
            return (this.update_required = true);
        this._updateDeviceNow();
        this.update_required = false;
    }
    _updateDeviceNow() {
        clearTimeout(this.response_timeout);
        this.response_timeout
            = setTimeout(this._onResponseTimeout.bind(this), 2000);
        this._sendConfig(this.local.conf);
    }
    _sendConfig(m) {
        this.dumping = false;
        this._send(m);
    }
    _sendDataDumpRequest() {
        this.dumping = true;
        this._send(new headtracker_1.HeadtrackerConfigPacket().setDeviceFlag(headtracker_1.HeadtrackerConfigFlags.DUMP_DATA));
    }
    _send(p) {
        if (this.socket)
            this.socket.send(p.toBuffer(), this.remote.port, this.remote.addr);
    }
    _state(s) {
        if (s != undefined)
            return s == this.remote.state;
        else
            return this.remote.state;
    }
    _setState(s) {
        this.remote.state = s;
    }
    _updateRemote() {
        this.emit('update');
    }
    // user functions
    setID(id) {
        this.local.conf.setDeviceID(id);
        this._updateDevice();
    }
    setSamplerate(rate) {
        this.local.conf.sample_rate = rate;
        this._updateDevice();
    }
    setStreamDest(ip, port) {
        log.info(`Setting headtracker ${this.remote.conf.deviceID()} stream destination address to ${ip}:${port}`);
        this.local.conf.stream_dest_addr = ip;
        this.local.conf.stream_dest_port = port;
        this._updateDevice();
    }
    setInvertation(invertation) {
        if (invertation.x)
            this.local.conf.setStateFlag(headtracker_1.HeadtrackerStateFlags.INVERT_X);
        else
            this.local.conf.clearStateFlag(headtracker_1.HeadtrackerStateFlags.INVERT_X);
        if (invertation.y)
            this.local.conf.setStateFlag(headtracker_1.HeadtrackerStateFlags.INVERT_Y);
        else
            this.local.conf.clearStateFlag(headtracker_1.HeadtrackerStateFlags.INVERT_Y);
        if (invertation.z)
            this.local.conf.setStateFlag(headtracker_1.HeadtrackerStateFlags.INVERT_Z);
        else
            this.local.conf.clearStateFlag(headtracker_1.HeadtrackerStateFlags.INVERT_Z);
        console.log(this.local.conf.device_state);
        this._updateDevice();
    }
    resetOrientation() {
        this.local.conf.setStateFlag(headtracker_1.HeadtrackerStateFlags.RESET_ORIENTATION);
        this.resetting_orientation = true;
        this._updateDevice();
    }
    applyNetworkSettings(settings) {
        if (settings.id)
            this.local.conf.setDeviceID(settings.id);
        if (settings.addr)
            this.local.conf.device_static_ip = settings.addr;
        if (settings.subnet)
            this.local.conf.device_static_subnet = settings.subnet;
        if (settings.dhcp != undefined) {
            if (settings.dhcp)
                this.local.conf.setNetworkFlag(headtracker_1.HeadtrackerNetworkFlags.DHCP);
            else
                this.local.conf.clearNetworkFlag(headtracker_1.HeadtrackerNetworkFlags.DHCP);
        }
        this.local.conf.setDeviceFlag(headtracker_1.HeadtrackerConfigFlags.UPDATE);
        this._updateDevice();
    }
    save() {
        this.local.conf.setDeviceFlag(headtracker_1.HeadtrackerConfigFlags.UPDATE);
        this._updateDevice();
    }
    reboot() {
        this.local.conf.setDeviceFlag(headtracker_1.HeadtrackerConfigFlags.REBOOT);
        this._updateDevice();
    }
    enableTx() {
        this.local.conf.setDeviceFlag(headtracker_1.HeadtrackerConfigFlags.STREAM_ENABLED);
        log.info(`Enabling data transmission on headtracking unit #${this.remote.id}`);
        this._updateDevice();
    }
    disableTx() {
        this.local.conf.clearDeviceFlag(headtracker_1.HeadtrackerConfigFlags.STREAM_ENABLED);
        log.info(`Disabling data transmission on headtracking unit #${this.remote.id}`);
        this._updateDevice();
    }
    destroy() {
        this.socket.close();
        clearTimeout(this.response_timeout);
        clearTimeout(this.check_alive_timeout);
    }
    isOnline() {
        return this._state(HTRKDevState.CONNECTED || HTRKDevState.BUSY);
    }
    start() {
        this._connect();
    }
}
exports.NetworkHeadtracker = NetworkHeadtracker;
//# sourceMappingURL=headtracker_network.js.map