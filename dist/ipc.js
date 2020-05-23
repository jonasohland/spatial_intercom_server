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
const events_1 = __importDefault(require("events"));
const fs_1 = __importDefault(require("fs"));
const lodash_1 = __importDefault(require("lodash"));
const net_1 = __importDefault(require("net"));
const split2_1 = __importDefault(require("split2"));
const Logger = __importStar(require("./log"));
const log = Logger.get('PIP');
function isNull(v) {
    return v == null;
}
var MessageMode;
(function (MessageMode) {
    MessageMode[MessageMode["GET"] = 0] = "GET";
    MessageMode[MessageMode["SET"] = 1] = "SET";
    MessageMode[MessageMode["DEL"] = 2] = "DEL";
    MessageMode[MessageMode["ALC"] = 3] = "ALC";
    MessageMode[MessageMode["RSP"] = 4] = "RSP";
    MessageMode[MessageMode["EVT"] = 5] = "EVT";
})(MessageMode = exports.MessageMode || (exports.MessageMode = {}));
function _pipename(name) {
    if (process.platform == 'win32')
        return `\\\\.\\pipe\\spat_icom_ipc_${name}`;
    else
        return `/tmp/spat_icom_ipc_${name}`;
}
function _make_pipe(name, callback) {
    let pname = _pipename(name);
    if (!(process.platform == 'win32') && fs_1.default.existsSync(pname))
        fs_1.default.unlinkSync(pname);
    let server = net_1.default.createServer(callback).listen(_pipename(name));
    log.info('Created Pipe on ' + _pipename(name));
    return server;
}
function _log_msg(msg, input) {
    let to_from = input ? ' TO ' : 'FROM';
    let ty = MessageMode[msg.mode];
    if (lodash_1.default.isObjectLike(msg.data))
        log.verbose(`Msg ${to_from} DSP: [${msg.target} -> ${msg.field}] [${ty}] -> [data truncated]`);
    else
        log.verbose(`Msg ${to_from} DSP: [${msg.target} -> ${msg.field}] [${ty}] -> ${msg.data}`);
}
function deleteLocalPipe(name) {
    if (fs_1.default.existsSync(_pipename(name)))
        fs_1.default.unlinkSync(_pipename(name));
}
class Message {
    constructor(tg, fld, md) {
        this.target = tg;
        this.field = fld;
        this.mode = md;
        this.data = null;
    }
    copy() {
        const m = new Message(this.target, this.field, this.mode);
        m.data = lodash_1.default.cloneDeep(this.data);
        return m;
    }
    toString() {
        return JSON.stringify({
            t: this.target,
            f: this.field,
            m: this.mode,
            d: this.data,
            e: this.err
        });
    }
    isError() {
        return (this.err != undefined) && this.err.length > 0;
    }
    static Set(tg, fld) {
        return new Message(tg, fld, MessageMode.SET);
    }
    static Get(tg, fld) {
        return new Message(tg, fld, MessageMode.GET);
    }
    static Del(tg, fld) {
        return new Message(tg, fld, MessageMode.DEL);
    }
    static Alc(tg, fld) {
        return new Message(tg, fld, MessageMode.ALC);
    }
    static Rsp(tg, fld) {
        return new Message(tg, fld, MessageMode.RSP);
    }
    static parse(data) {
        const obj = JSON.parse(data);
        const checkValue = (v, name) => {
            if (isNull(v))
                throw new Error('Invalid message, missing ' + name + ' field');
        };
        checkValue(obj.t, 'target');
        checkValue(obj.f, 'field');
        checkValue(obj.m, 'mode');
        // we do not require a data field any more
        // checkValue(obj.d, 'data');
        const m = new Message(obj.t, obj.f, obj.m);
        m.data = obj.d;
        if (obj.e && obj.e.length > 0)
            m.err = obj.e;
        return m;
    }
    setInt(i) {
        this.data = Number.parseInt('' + i);
        return this;
    }
    setFloat(f) {
        this.data = Number.parseFloat('' + f);
        return this;
    }
    setString(s) {
        this.data = s;
        return this;
    }
    setArray(arr) {
        this.data = arr;
        return this;
    }
}
exports.Message = Message;
class Requester extends events_1.default {
    constructor(connection, target) {
        super();
        this.request_target = target;
        this.connection = connection;
        // propagate events to the listener
        this.connection.on(target, (msg) => {
            if (msg.mode == MessageMode.EVT)
                this.emit(msg.field);
        });
    }
    request(value, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.connection.request(this.request_target, value, 10000, data);
        });
    }
    requestTmt(value, timeout, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.connection.request(this.request_target, value, timeout, data);
        });
    }
    set(value, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.connection.set(this.request_target, value, 10000, data);
        });
    }
    setTmt(value, timeout, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.connection.set(this.request_target, value, timeout, data);
        });
    }
}
exports.Requester = Requester;
;
class Connection extends events_1.default {
    _do_request(req, tg, fld, timeout, data) {
        return __awaiter(this, void 0, void 0, function* () {
            let self = this;
            return new Promise((resolve, reject) => {
                let tmt = setTimeout(() => {
                    self.removeListener(tg, response_listener);
                    reject('timeout');
                }, timeout || 1000);
                let response_listener = (msg) => {
                    if (msg.field == fld && msg.mode != MessageMode.EVT) {
                        self.removeListener(tg, response_listener);
                        clearTimeout(tmt);
                        if (msg.isError())
                            reject(new Error(msg.err));
                        else
                            resolve(msg);
                    }
                };
                let msg = (req) ? Message.Get(tg, fld) : Message.Set(tg, fld);
                msg.data = data;
                this.addListener(tg, response_listener);
                this.send(msg);
            });
        });
    }
    request(tg, fld, timeout, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._do_request(true, tg, fld, timeout, data);
        });
    }
    set(tg, fld, timeout, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return this._do_request(false, tg, fld, timeout, data);
        });
    }
    getRequester(target) {
        return new Requester(this, target);
    }
    decodeMessage(str) {
        let msg = Message.parse(str);
        _log_msg(msg, false);
        this.emit(msg.target, msg);
    }
    connectionFound() { }
}
exports.Connection = Connection;
class LocalConnection extends Connection {
    constructor(name) {
        super();
        this.socket = null;
        this.name = name;
    }
    isLocal() {
        return true;
    }
    begin() {
        let self = this;
        _make_pipe(this.name, (sock) => {
            log.info('Local DSP process connected');
            sock.pipe(split2_1.default('\0')).on('data', data => {
                self.decodeMessage(data);
            });
            sock.on('close', (err) => {
                if (err)
                    log.warn('Local DSP process disconnected with error:  '
                        + err.message);
                else
                    log.info('Local DSP process disconnected');
            });
            sock.on('error', (err) => {
                log.error(err);
            });
            self.socket = sock;
            self.emit('connection', sock);
        });
    }
    send(msg) {
        _log_msg(msg, true);
        this.socket.write(msg.toString() + '\0');
    }
}
exports.LocalConnection = LocalConnection;
class RemoteConnection extends Connection {
    constructor(socket) {
        super();
        this.socket = socket;
    }
    begin() {
        let self = this;
        this.socket.on('ipc-bridge-begin', () => {
            self.socket.removeAllListeners();
            log.info('Remote DSP process connected');
            self.socket.on('disconnect', (reason) => {
                log.warn('Remote DSP process disconnected ' + reason);
            });
            self.socket.on('msg', (data) => {
                let msg = Message.parse(data);
                self.emit(msg.target, msg);
            });
            self.emit('connection');
        });
        this.socket.emit('ipc-bridge-init');
    }
    send(msg) {
        this.socket.emit('msg', msg.toString());
    }
    isLocal() {
        return false;
    }
}
exports.RemoteConnection = RemoteConnection;
class IPCBridge extends events_1.default {
    constructor(socket, addr, name) {
        super();
        this.socket = socket;
        this.name = name;
        let self = this;
        this.socket.on('connect', () => {
            log.info("Connected");
            self.begin();
        });
        this.socket.on('disconnect', () => {
            self.reset();
        });
        this.socket.on('msg', (msg) => {
            let msgobj = Message.parse(msg);
            _log_msg(msgobj, true);
            if (self.connected) {
                if (self.ipc_socket)
                    self.ipc_socket.write(msg + '\0');
            }
            else {
                log.error("Not connected");
                msgobj.err = "NOT CONNECTED";
                msgobj.mode = MessageMode.RSP;
                self.emit('msg', msg.toString());
            }
        });
        this.socket.on('ipc-bridge-init', () => {
            log.info("Received IPC bridge init msg");
            if (self.connected)
                self.socket.emit('ipc-bridge-begin');
        });
    }
    begin() {
        let self = this;
        this.ipc_server = _make_pipe(this.name, (pipe) => {
            this.ipc_socket = pipe;
            pipe.pipe(split2_1.default('\0')).on('data', data => {
                _log_msg(Message.parse(data), false);
                self.socket.emit('msg', data);
            });
            pipe.on('close', (err) => {
                if (err)
                    log.warn('Local DSP process disconnected with error:  '
                        + err.message);
                else
                    log.info('Local DSP process disconnected');
                self.connected = false;
                self.socket.close();
                self.emit('close');
                self.reset();
            });
            pipe.on('error', (err) => {
                log.error(err);
                self.connected = false;
            });
            self.ipc_socket = pipe;
            self.connected = true;
            self.socket.emit('ipc-bridge-begin');
        });
    }
    reset() {
        log.warn("Connection lost, resetting.");
        deleteLocalPipe(this.name);
        if (this.ipc_server) {
            this.ipc_server.close();
            this.ipc_server.removeAllListeners();
        }
        if (this.ipc_socket) {
            this.ipc_socket.end();
            this.ipc_socket.removeAllListeners();
        }
    }
}
exports.IPCBridge = IPCBridge;
//# sourceMappingURL=ipc.js.map