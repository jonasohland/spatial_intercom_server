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
Object.defineProperty(exports, "__esModule", { value: true });
const cp = __importStar(require("child_process"));
const dgram = __importStar(require("dgram"));
const events_1 = require("events");
const fs = __importStar(require("fs"));
const osc = __importStar(require("osc-min"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const semver = __importStar(require("semver"));
const headtracker_1 = require("./headtracker");
const Logger = __importStar(require("./log"));
const util = __importStar(require("./util"));
const log = Logger.get('SERIAL');
class QuaternionContainer {
    constructor(buf, isFloat, offset) {
        this._is_float = isFloat;
        this._offset = offset;
    }
    get() {
        if (this._is_float)
            return headtracker_1.Quaternion.fromBuffer(this._buf, this._offset);
        else
            return headtracker_1.Quaternion.fromInt16Buffer(this._buf, this._offset);
    }
    float() {
        return this._is_float;
    }
    data() {
        return { buffer: this._buf, offset: this._offset };
    }
}
exports.QuaternionContainer = QuaternionContainer;
class OutputAdapter {
}
exports.OutputAdapter = OutputAdapter;
class UDPOutputAdapter extends OutputAdapter {
    constructor() {
        super();
        this.socket = dgram.createSocket('udp4');
    }
    setRemote(addr, port) {
        this.addr = addr;
        this.port = port;
    }
    sendData(data) {
        if (!this.addr)
            return;
        this.socket.send(data, this.port, this.addr);
    }
}
exports.UDPOutputAdapter = UDPOutputAdapter;
class OSCOutputAdapter extends UDPOutputAdapter {
    setOutputEuler(do_output) {
        this.output_e = do_output;
    }
    setOutputQuaternions(do_output) {
        this.output_q = do_output;
    }
    setQuatAddresses(addrs) {
        this.q_addr = addrs;
    }
    setEulerAddresses(addrs) {
        this.e_addr = addrs;
    }
    process(qc) {
        let q = qc.get();
        if (this.output_e) {
            let eulers = q.toEuler();
            this.sendData(osc.toBuffer({
                oscType: 'bundle',
                elements: [
                    {
                        oscType: 'message',
                        address: this.e_addr[0],
                        args: [eulers.yaw]
                    },
                    {
                        oscType: 'message',
                        address: this.e_addr[1],
                        args: [eulers.pitch]
                    },
                    {
                        oscType: 'message',
                        address: this.e_addr[2],
                        args: [eulers.roll]
                    }
                ]
            }));
        }
        if (this.output_q) {
            this.sendData(osc.toBuffer({
                oscType: 'bundle',
                elements: [
                    {
                        oscType: 'message',
                        address: this.q_addr[0],
                        args: [q.w]
                    },
                    {
                        oscType: 'message',
                        address: this.q_addr[1],
                        args: [q.x]
                    },
                    {
                        oscType: 'message',
                        address: this.q_addr[2],
                        args: [q.y]
                    },
                    {
                        oscType: 'message',
                        address: this.q_addr[3],
                        args: [q.z]
                    }
                ]
            }));
        }
    }
}
exports.OSCOutputAdapter = OSCOutputAdapter;
class IEMOutputAdapter extends OSCOutputAdapter {
    constructor() {
        super();
        this.setOutputQuaternions(true);
        this.setQuatAddresses([
            '/SceneRotator/qw',
            '/SceneRotator/qx',
            '/SceneRotator/qy',
            '/SceneRotator/qz'
        ]);
        this.setEulerAddresses([
            '/SceneRotator/yaw',
            '/SceneRotator/pitch',
            '/SceneRotator/roll'
        ]);
    }
}
exports.IEMOutputAdapter = IEMOutputAdapter;
class FirmwareManager {
    validateFirmware(fw) {
        return __awaiter(this, void 0, void 0, function* () { });
    }
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            let firmwares_base_path = path.resolve(__dirname, '../bin/headtracker_firmware');
            return new Promise((mres, mrej) => {
                // check for dirs containing a valid "version" file (it was
                // late....)
                // clang-format off
                fs.readdir(firmwares_base_path, (err, files) => {
                    if (err)
                        mrej();
                    Promise
                        .all(files.map((file) => __awaiter(this, void 0, void 0, function* () {
                        return new Promise((res, rej) => {
                            file = firmwares_base_path + '/'
                                + file;
                            log.info("Check firmware: " + file);
                            fs.lstat(file, (err, stats) => {
                                if (stats.isDirectory())
                                    res(file);
                                else
                                    res('');
                            });
                        });
                    })))
                        .then(dirs => {
                        dirs = dirs.filter(dir => dir != '');
                        return Promise.all(dirs.map((dir) => __awaiter(this, void 0, void 0, function* () {
                            return new Promise((res, rej) => {
                                fs.readdir(dir, (err, fmfiles) => {
                                    for (let f of fmfiles) {
                                        if (f == 'version') {
                                            log.info("Check version file " + dir + '/' + f);
                                            return fs.readFile(dir + '/' + f, (err, data) => {
                                                if (err) {
                                                    res([]);
                                                }
                                                let vstring = data.toString().trim();
                                                if (semver.valid(vstring))
                                                    return res([
                                                        dir,
                                                        vstring
                                                    ]);
                                                else
                                                    res([]);
                                            });
                                        }
                                    }
                                    res([]);
                                });
                            });
                        })));
                    })
                        .then(dirs => {
                        this.firmwares = dirs.filter(d => d.length == 2).map(d => {
                            return {
                                base_path: d[0], version: d[1]
                            };
                        }).sort((fm_lhs, fm_rhs) => semver.compare(fm_lhs.version, fm_rhs.version));
                        mres();
                    })
                        .catch(err => {
                        log.error('Could not fetch firmares');
                        mrej();
                    });
                });
            });
            // clang-format on
        });
    }
    getLatest() {
        return (this.firmwares.length)
            ? this.firmwares[this.firmwares.length - 1]
            : null;
    }
}
exports.FirmwareManager = FirmwareManager;
class AVRDUDEProgrammer {
    constructor(nanobootloader) {
        this._nano_bootloader = nanobootloader;
        this._avrdude_executable = 'avrdude';
    }
    isInstalled() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((res, rej) => {
                cp.execFile(this._avrdude_executable, ['-?'], (err, stdout, stderr) => {
                    if (err)
                        return rej();
                    let lines = stderr.split('\n');
                    log.info('Found AVRDUDE version '
                        + lines[lines.length - 2].split(' ')[2]);
                    res(true);
                });
            });
        });
    }
    flashFirmware(firmware, port) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.isInstalled();
            let args = [];
            log.info(this._nano_bootloader + ' bootloader selected');
            args.push('-p');
            args.push('atmega328p');
            args.push('-c');
            args.push('arduino');
            args.push('-P');
            args.push(port);
            args.push('-b');
            if (this._nano_bootloader == 'new')
                args.push('115200');
            else
                args.push('57600');
            args.push('-D');
            args.push('-U');
            args.push(`flash:w:firmware.hex:i`);
            return new Promise((res, rej) => {
                log.info('Writing firmware to device. This should take just a few seconds');
                let avrd = cp.spawn(this._avrdude_executable, args, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    cwd: firmware.base_path
                });
                avrd.on('close', (code, sig) => {
                    if (code != 0) {
                        log.error('avrdude failed with code ' + code);
                        return rej();
                    }
                    log.info('avrdude exited with code 0');
                    res();
                });
                const avrlog = Logger.get('AVR');
                const stdoutreader = readline.createInterface({ input: avrd.stdout });
                const stderrreader = readline.createInterface({ input: avrd.stderr });
                stderrreader.on('line', (line) => {
                    avrlog.warn(line);
                });
                stdoutreader.on('line', (line) => {
                    avrlog.info(line);
                });
            });
        });
    }
}
function invertationToBitmask(inv) {
    let i = 0;
    if (inv.x)
        i |= util.bitValue(3);
    if (inv.y)
        i |= util.bitValue(4);
    if (inv.z)
        i |= util.bitValue(5);
    return i;
}
var si_gy_values;
(function (si_gy_values) {
    si_gy_values[si_gy_values["SI_GY_VALUES_MIN"] = 0] = "SI_GY_VALUES_MIN";
    si_gy_values[si_gy_values["SI_GY_QUATERNION"] = 1] = "SI_GY_QUATERNION";
    si_gy_values[si_gy_values["SI_GY_SRATE"] = 2] = "SI_GY_SRATE";
    si_gy_values[si_gy_values["SI_GY_ALIVE"] = 3] = "SI_GY_ALIVE";
    si_gy_values[si_gy_values["SI_GY_ENABLE"] = 4] = "SI_GY_ENABLE";
    si_gy_values[si_gy_values["SI_GY_CONNECTED"] = 5] = "SI_GY_CONNECTED";
    si_gy_values[si_gy_values["SI_GY_FOUND"] = 6] = "SI_GY_FOUND";
    si_gy_values[si_gy_values["SI_GY_VERSION"] = 7] = "SI_GY_VERSION";
    si_gy_values[si_gy_values["SI_GY_HELLO"] = 8] = "SI_GY_HELLO";
    si_gy_values[si_gy_values["SI_GY_RESET"] = 9] = "SI_GY_RESET";
    si_gy_values[si_gy_values["SI_GY_INV"] = 10] = "SI_GY_INV";
    si_gy_values[si_gy_values["SI_GY_RESET_ORIENTATION"] = 11] = "SI_GY_RESET_ORIENTATION";
    si_gy_values[si_gy_values["SI_GY_INT_COUNT"] = 12] = "SI_GY_INT_COUNT";
    si_gy_values[si_gy_values["SI_GY_VALUES_MAX"] = 13] = "SI_GY_VALUES_MAX";
})(si_gy_values || (si_gy_values = {}));
var si_gy_parser_state;
(function (si_gy_parser_state) {
    si_gy_parser_state[si_gy_parser_state["SI_PARSER_FIND_SYNC"] = 1] = "SI_PARSER_FIND_SYNC";
    si_gy_parser_state[si_gy_parser_state["SI_PARSER_SYNCING"] = 2] = "SI_PARSER_SYNCING";
    si_gy_parser_state[si_gy_parser_state["SI_PARSER_READ_VALUE_TYPE"] = 3] = "SI_PARSER_READ_VALUE_TYPE";
    si_gy_parser_state[si_gy_parser_state["SI_PARSER_MESSAGE_TYPE"] = 4] = "SI_PARSER_MESSAGE_TYPE";
    si_gy_parser_state[si_gy_parser_state["SI_PARSER_READ_VALUE"] = 5] = "SI_PARSER_READ_VALUE";
})(si_gy_parser_state || (si_gy_parser_state = {}));
var si_gy_message_types;
(function (si_gy_message_types) {
    si_gy_message_types[si_gy_message_types["SI_GY_MSG_TY_MIN"] = 10] = "SI_GY_MSG_TY_MIN";
    si_gy_message_types[si_gy_message_types["SI_GY_GET"] = 11] = "SI_GY_GET";
    si_gy_message_types[si_gy_message_types["SI_GY_SET"] = 12] = "SI_GY_SET";
    si_gy_message_types[si_gy_message_types["SI_GY_NOTIFY"] = 13] = "SI_GY_NOTIFY";
    si_gy_message_types[si_gy_message_types["SI_GY_RESP"] = 14] = "SI_GY_RESP";
    si_gy_message_types[si_gy_message_types["SI_GY_ACK"] = 15] = "SI_GY_ACK";
    si_gy_message_types[si_gy_message_types["SI_GY_MSG_TY_MAX"] = 16] = "SI_GY_MSG_TY_MAX";
})(si_gy_message_types || (si_gy_message_types = {}));
var CON_STATE;
(function (CON_STATE) {
    CON_STATE[CON_STATE["OFFLINE"] = 0] = "OFFLINE";
    CON_STATE[CON_STATE["GET_VERSION"] = 1] = "GET_VERSION";
    CON_STATE[CON_STATE["INIT"] = 2] = "INIT";
    CON_STATE[CON_STATE["ONLINE"] = 3] = "ONLINE";
    CON_STATE[CON_STATE["LOST"] = 4] = "LOST";
})(CON_STATE || (CON_STATE = {}));
const si_serial_msg_lengths = [
    0,
    16,
    1,
    1,
    1,
    1,
    1,
    3,
    5,
    1,
    1,
    1,
    8,
    0
];
const SI_SERIAL_SYNC_CODE = 0x23;
class SerialConnection extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this._serial_state = 0;
    }
    serial_init(port) {
        this._serial_buffer
            = Buffer.alloc(Math.max(...si_serial_msg_lengths) + 5);
        this.serial_port = port;
        this._serial_reset();
        this.openSerialPort();
    }
    closeSerialPort() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((res, rej) => {
                this.serial_port.close(err => {
                    if (err)
                        rej(err);
                    else
                        res(err);
                });
            });
        });
    }
    openSerialPort() {
        let self = this;
        this.serial_port.on('readable', () => {
            let data = self.serial_port.read();
            for (let char of data)
                self.readByte(char);
        });
        this.serial_port.on('error', err => {
            log.error('Error on serial port: ' + err.message);
        });
        this.serial_port.on('close', err => {
            log.info('Serial port closed');
            this.emit('close', err);
        });
        this.serial_port.open();
    }
    serialNotify(val) {
        this._serial_write_message(Buffer.alloc(si_serial_msg_lengths[val], 0), val, si_gy_message_types.SI_GY_NOTIFY);
    }
    serialSet(val, data) {
        this._serial_write_message(data, val, si_gy_message_types.SI_GY_SET);
    }
    serialReq(val, data) {
        this._serial_write_message(data || Buffer.alloc(si_serial_msg_lengths[val]), val, si_gy_message_types.SI_GY_GET);
    }
    readByte(next_byte) {
        switch (this._serial_state) {
            case si_gy_parser_state.SI_PARSER_FIND_SYNC:
                return this._serial_find_sync(next_byte);
            case si_gy_parser_state.SI_PARSER_SYNCING:
                return this._serial_sync(next_byte);
            case si_gy_parser_state.SI_PARSER_READ_VALUE_TYPE:
                return this._serial_read_valtype(next_byte);
            case si_gy_parser_state.SI_PARSER_MESSAGE_TYPE:
                return this._serial_read_msg_type(next_byte);
            case si_gy_parser_state.SI_PARSER_READ_VALUE:
                return this._serial_read_value(next_byte);
        }
    }
    _serial_write_message(buf, ty, md) {
        let out_b = Buffer.alloc(si_serial_msg_lengths[ty] + 6);
        for (let i = 0; i < 4; ++i)
            out_b.writeUInt8(SI_SERIAL_SYNC_CODE, i);
        out_b.writeUInt8(ty, 4);
        out_b.writeUInt8(md, 5);
        buf.copy(out_b, 6, 0);
        this.serial_port.write(out_b);
    }
    _serial_on_get_msg() {
        this._serial_write_message(this.onValueRequest(this._serial_current_value_type), this._serial_current_value_type, si_gy_message_types.SI_GY_SET);
    }
    _serial_reset() {
        this._serial_state = si_gy_parser_state.SI_PARSER_FIND_SYNC;
        this._serial_sync_count = 0;
    }
    _serial_find_sync(byte) {
        this._serial_state = si_gy_parser_state.SI_PARSER_SYNCING;
        this._serial_sync_count = 1;
    }
    _serial_sync(byte) {
        if (this._serial_sync_count < 3) {
            if (byte == SI_SERIAL_SYNC_CODE)
                this._serial_sync_count++;
            else
                this._serial_reset();
        }
        else if (this._serial_sync_count == 3) {
            this._serial_state = si_gy_parser_state.SI_PARSER_READ_VALUE_TYPE;
            this._serial_sync_count = 0;
        }
        else
            this._serial_reset();
    }
    _serial_read_valtype(byte) {
        if (byte > si_gy_values.SI_GY_VALUES_MIN
            && byte < si_gy_values.SI_GY_VALUES_MAX) {
            this._serial_current_value_type = byte;
            this._serial_state = si_gy_parser_state.SI_PARSER_MESSAGE_TYPE;
        }
        else
            this._serial_reset();
    }
    _serial_read_msg_type(byte) {
        this._serial_current_msg_type = byte;
        this._serial_state = si_gy_parser_state.SI_PARSER_READ_VALUE;
    }
    _serial_read_value(byte) {
        if (this._serial_sync_count
            < si_serial_msg_lengths[this._serial_current_value_type] - 1)
            this._serial_buffer.writeUInt8(byte, this._serial_sync_count++); // serial->buffer[serial->scount++]
        // = dat;
        else {
            /* console.log(
                'Read full value '
                + si_gy_values[this._serial_current_value_type] + ' size '
                + si_serial_msg_lengths[this._serial_current_value_type]); */
            this._serial_buffer.writeUInt8(byte, this._serial_sync_count);
            let b = Buffer.alloc(si_serial_msg_lengths[this._serial_current_value_type]);
            this._serial_buffer.copy(b);
            switch (this._serial_current_msg_type) {
                case si_gy_message_types.SI_GY_SET:
                    this.onValueSet(this._serial_current_value_type, b);
                    break;
                case si_gy_message_types.SI_GY_NOTIFY:
                    this.onNotify(this._serial_current_value_type, b);
                    break;
                case si_gy_message_types.SI_GY_GET:
                    this._serial_on_get_msg();
                    break;
                case si_gy_message_types.SI_GY_ACK:
                    this.onACK(this._serial_current_value_type);
                    break;
                case si_gy_message_types.SI_GY_RESP:
                    this.onResponse(this._serial_current_value_type, b);
                    break;
                default:
                    log.error('Unexpected message of type 0x'
                        + this._serial_current_msg_type.toString(16)
                            .toUpperCase());
            }
            this._serial_reset();
        }
    }
}
class HeadtrackerSerialReq {
    constructor() {
        this.tcnt = 0;
    }
    static newNotify(res, rej, val_ty) {
        let tsk = new HeadtrackerSerialReq();
        tsk.mty = si_gy_message_types.SI_GY_NOTIFY;
        tsk.vty = val_ty;
        tsk.nresolve = res;
        tsk.reject = rej;
        return tsk;
    }
    static newSet(res, rej, val_ty, data) {
        let tsk = new HeadtrackerSerialReq();
        tsk.mty = si_gy_message_types.SI_GY_SET;
        tsk.vty = val_ty;
        tsk.nresolve = res;
        tsk.reject = rej;
        tsk.buf = data;
        return tsk;
    }
    static newReq(res, rej, val_ty, args) {
        let tsk = new HeadtrackerSerialReq();
        tsk.mty = si_gy_message_types.SI_GY_GET;
        tsk.vty = val_ty;
        tsk.resolve = res;
        tsk.reject = rej;
        tsk.buf = args;
        return tsk;
    }
}
class SerialHeadtracker extends SerialConnection {
    constructor(serial) {
        super();
        this._rqueue = [];
        this._is_ok = false;
        this.last_int = 0;
        this.last_read_cnt = 0;
        this.serial_init(serial);
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.getValue(si_gy_values.SI_GY_HELLO)
                .then((data) => {
                if (data.toString() == 'hello')
                    log.info('Got valid HELLO response from Headtracker');
                else
                    log.error('Got invalid HELLO response from Headtracker');
                return this.getValue(si_gy_values.SI_GY_VERSION);
            })
                .then((data) => {
                this.software_version = `${data.readUInt8(0)}.${data.readUInt8(1)}.${data.readUInt8(2)}`;
                log.info(`Headtracker software version: ${this.software_version}`);
                this._watchdog = setInterval(() => {
                    /*this.getValue(si_gy_values.SI_GY_INT_COUNT)
                        .then((data) => {

                            let intc = data.readUInt32LE(0);
                            let rcnt = data.readUInt32LE(4);

                            let cintc = intc - this.last_int;
                            let crcnt = rcnt - this.last_read_cnt;

                            this.last_int = intc;
                            this.last_read_cnt = rcnt;

                            log.info(`Interrupts/s: ${cintc} read ops/s:
                       ${crcnt}`);
                        });*/
                    this.notify(si_gy_values.SI_GY_ALIVE)
                        .then(() => {
                        this._is_ok = true;
                    })
                        .catch(err => {
                        log.warn('Lost connection to Headtracker');
                        this._is_ok = false;
                    });
                }, 1000, this);
            }).catch(err => {
                log.error(`Could not initialize device ${this.serial_port.path}. Error: ${err}`);
                this.emit('close', err);
            });
        });
    }
    destroy() {
        return __awaiter(this, void 0, void 0, function* () {
            clearInterval(this._watchdog);
            if (this._req_current)
                this._req_current.reject("Instance destroyed");
            while (this._rqueue.length)
                this._rqueue.shift().reject('Instance destroyed');
            return this.closeSerialPort();
        });
    }
    isOnline() {
        return this._is_ok;
    }
    setValue(ty, data) {
        return new Promise((res, rej) => {
            this._new_request(HeadtrackerSerialReq.newSet(res, rej, ty, data));
        });
    }
    getValue(ty, data) {
        if (!data)
            data = Buffer.alloc(si_serial_msg_lengths[ty]).fill(13);
        log.info('Send GET ' + si_gy_values[ty]);
        return new Promise((res, rej) => {
            this._new_request(HeadtrackerSerialReq.newReq(res, rej, ty, data));
        });
    }
    notify(ty) {
        return new Promise((res, rej) => {
            this._new_request(HeadtrackerSerialReq.newNotify(res, rej, ty));
        });
    }
    _start_request(req) {
        let reqfn = () => {
            switch (req.mty) {
                case si_gy_message_types.SI_GY_GET:
                    this.serialReq(req.vty, req.buf);
                    break;
                case si_gy_message_types.SI_GY_SET:
                    this.serialSet(req.vty, req.buf);
                    break;
                case si_gy_message_types.SI_GY_NOTIFY:
                    this.serialNotify(req.vty);
                    break;
            }
            req.tcnt++;
            if (req.tcnt > 40)
                req.reject('Timeout');
        };
        req.tm = setInterval(reqfn, 120, this);
        process.nextTick(reqfn);
        this._req_current = req;
    }
    _new_request(req) {
        if (!this._req_current)
            this._start_request(req);
        else
            this._rqueue.push(req);
    }
    _end_request(data) {
        clearInterval(this._req_current.tm);
        if (data)
            this._req_current.resolve(data);
        else
            this._req_current.nresolve();
        this._req_current = null;
        if (this._rqueue.length)
            this._start_request(this._rqueue.shift());
    }
    /* --------------------------------------------------------------------- */
    onValueRequest(ty) {
        return Buffer.alloc(32);
    }
    onValueSet(ty, data) {
        if (ty == si_gy_values.SI_GY_QUATERNION)
            this.emit('quat', new QuaternionContainer(data, true, 0));
    }
    onNotify(ty, data) {
        console.log('NOTIFY: ' + si_gy_values[ty]);
    }
    onACK(ty) {
        if (this._req_current && this._req_current.vty == ty)
            this._end_request();
    }
    onResponse(ty, data) {
        if (this._req_current && this._req_current.vty == ty)
            this._end_request(data);
    }
}
exports.SerialHeadtracker = SerialHeadtracker;
class LocalHeadtracker extends headtracker_1.Headtracker {
    constructor(port, out) {
        super();
        this._ltc = {
            results: [],
        };
        this.shtrk = new SerialHeadtracker(port);
        this.remote.conf = new headtracker_1.HeadtrackerConfigPacket();
        this.output = out;
        this.shtrk.init().then(() => {
            this.emit('update');
            this.emit('ready');
        });
        this.shtrk.on('quat', (q) => {
            this.output.process(q);
        });
        this.shtrk.on('close', err => {
            this.emit('close', err);
        });
    }
    flashNewestFirmware(nanobootloader) {
        return __awaiter(this, void 0, void 0, function* () {
            let fwman = new FirmwareManager();
            yield fwman.initialize();
            if (semver.compare(fwman.getLatest().version, this.shtrk.software_version)
                <= 0) {
                log.info('Device already on newest software version');
                return;
            }
            let ppath = this.shtrk.serial_port.path;
            yield this.shtrk.destroy();
            log.info('Port closed');
            log.info(`Flashing firmware version ${fwman.getLatest().version}`);
            let pgm = new AVRDUDEProgrammer(nanobootloader);
            return pgm.flashFirmware(fwman.getLatest(), ppath);
        });
    }
    checkLatency() {
        return __awaiter(this, void 0, void 0, function* () {
            log.info('Testing latency on Headtracker. This will take about 20 seconds');
            return new Promise((res, rej) => {
                this._ltc.done = res;
                this._ltc.err = rej;
                this._ltc.cnt = 0;
                clearInterval(this.shtrk._watchdog);
                this._ltc_run();
            });
        });
    }
    _ltc_run() {
        return __awaiter(this, void 0, void 0, function* () {
            let tstart = process.hrtime.bigint();
            yield this.shtrk.notify(si_gy_values.SI_GY_ALIVE);
            let tend = process.hrtime.bigint();
            let res = (Number(tend - tstart) / 1000000);
            if (this._ltc.cnt > 50)
                this._ltc.results.push(res);
            this._ltc.cnt++;
            if (this._ltc.cnt > 200) {
                let sum = 0;
                this._ltc.results.forEach(res => sum += res);
                let avg = sum / this._ltc.results.length;
                log.info(`Results: MAX: ${Math.max(...this._ltc.results).toFixed(2)}ms, MIN: ${Math.min(...this._ltc.results).toFixed(2)}ms, AVG: ${avg.toFixed(2)}ms`);
                return this._ltc.done();
            }
            // log.info(`Run# ${this._ltc.cnt - 50} latency: ${res.toFixed(3)}ms ${
            //    (this._ltc.cnt <= 50) ? '(warmup)' : ''}`);
            setTimeout(this._ltc_run.bind(this), 30);
        });
    }
    setSamplerate(sr) {
        console.log('set srate' + sr);
        this.shtrk.setValue(si_gy_values.SI_GY_SRATE, Buffer.alloc(1, sr));
    }
    enableTx() {
        return this.shtrk.setValue(si_gy_values.SI_GY_ENABLE, Buffer.alloc(1, 1));
    }
    disableTx() {
        return this.shtrk.setValue(si_gy_values.SI_GY_ENABLE, Buffer.alloc(1, 0));
    }
    save() {
        console.log('Would save locally here');
    }
    reboot() {
        this.shtrk.getValue(si_gy_values.SI_GY_RESET).then(err => {
            this.shtrk.destroy();
            this.shtrk.init();
        });
    }
    setInvertation(inv) {
        this.shtrk.setValue(si_gy_values.SI_GY_INV, Buffer.alloc(1, invertationToBitmask(inv)));
    }
    resetOrientation() {
        this.shtrk.setValue(si_gy_values.SI_GY_RESET_ORIENTATION, Buffer.alloc(1, 1));
    }
    applyNetworkSettings(settings) {
        log.error('Cannot set network settings on serial headtracker');
    }
    destroy() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.shtrk.destroy();
        });
    }
    isOnline() {
        return this.shtrk.isOnline();
    }
    setStreamDest(addr, port) {
        log.error('Cannot set stream destination on serial headtracker');
    }
}
exports.LocalHeadtracker = LocalHeadtracker;
//# sourceMappingURL=headtracker_serial.js.map