import * as cp from 'child_process';
import * as dgram from 'dgram';
import {EventEmitter} from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as osc from 'osc-min';
import * as path from 'path';
import * as semver from 'semver';
import SerialPort from 'serialport';

import {
    Headtracker,
    HeadtrackerConfigPacket,
    HeadtrackerInvertation,
    HeadtrackerNetworkSettings,
    Quaternion
} from './headtracker';

import * as Logger from './log';
import * as util from './util';

const log = Logger.get('SHK');

abstract class OutputAdapter {
    abstract process(q: Quaternion): void;
}

abstract class UDPOutputAdapter extends OutputAdapter {

    addr: string;
    port: number;

    socket: dgram.Socket;

    constructor()
    {   
        super();
        this.socket = dgram.createSocket('udp4');
    }

    setRemote(addr: string, port: number)
    {
        this.addr = addr;
        this.port = port;
    }

    sendData(data: Buffer)
    {
        if(!this.addr)
            return;

        this.socket.send(data, this.port, this.addr);
    }
}

abstract class OSCOutputAdapter extends UDPOutputAdapter {
    
    output_q: boolean;
    output_e: boolean;

    q_addr: [string, string, string, string];
    e_addr: [string, string, string];

    setOutputEuler(do_output: boolean)
    {
        this.output_e = do_output;
    }

    setOutputQuaternions(do_output: boolean)
    {
        this.output_q = do_output;
    }

    setQuatAddresses(addrs: [string,string,string,string])
    {
        this.q_addr = addrs;
    }

    setEulerAddresses(addrs: [string,string,string])
    {
        this.e_addr = addrs;
    }

    process(q: Quaternion)
    {
        if(this.output_e) {
            let eulers = q.toEuler();
            this.sendData(osc.toBuffer({
                oscType: "bundle",
                elements: [
                    {
                        oscType: "message",
                        address: this.e_addr[0],
                        args: [eulers.yaw] 
                    },
                    {
                        oscType: "message",
                        address: this.e_addr[1],
                        args: [eulers.pitch] 
                    },
                    {
                        oscType: "message",
                        address: this.e_addr[2],
                        args: [eulers.roll] 
                    }
                ]
            }))
        }
        if(this.output_q) {
            this.sendData(osc.toBuffer({
                oscType: "bundle",
                elements: [
                    {
                        oscType: "message",
                        address: this.q_addr[0],
                        args: [q.w]
                    },
                    {
                        oscType: "message",
                        address: this.q_addr[1],
                        args: [q.x]
                    },
                    {
                        oscType: "message",
                        address: this.q_addr[2],
                        args: [q.y]
                    },
                    {
                        oscType: "message",
                        address: this.q_addr[3],
                        args: [q.z]
                    }
                ]
            }))
        }
    }
}

class IEMOutputAdapter extends OSCOutputAdapter {
    constructor() {
        super();
        this.setOutputQuaternions(true);
        this.setQuatAddresses([
            "/SceneRotator/qw",
            "/SceneRotator/qx",
            "/SceneRotator/qy",
            "/SceneRotator/qz"
        ]);
        this.setEulerAddresses([
            "/SceneRotator/yaw",
            "/SceneRotator/pitch",
            "/SceneRotator/roll"
        ]);
    }
}

export interface HeadtrackerFirmware {
    base_path: string;
    checksum?: string;
    version: string;
}

export class FirmwareManager {

    firmwares: HeadtrackerFirmware[];

    async validateFirmware(fw: HeadtrackerFirmware) {}

    async initialize()
    {
        let firmwares_base_path
            = path.resolve(__dirname, '../bin/headtracker_firmware');

        return new Promise((mres, mrej) => {
        // check for dirs containing a valid "version" file (it was late....)
        fs.readdir(
            firmwares_base_path,
            (err, files) => {
                if(err)
                    mrej();
                Promise
                    .all(files.map(async(file: string):
                                       Promise<string> => {
                                           return new Promise((res, rej) => {
                                               file = firmwares_base_path + '/'
                                                      + file;
                                                log.info("Check firmware: " + file);
                                               fs.lstat(file, (err, stats) => {
                                                   if (stats.isDirectory())
                                                       res(file)
                                                    else res('');
                                               });
                                           })

                                       }))
                    .then(dirs => {
                        dirs = dirs.filter(dir => dir != '');
                        return Promise.all(dirs.map(async (dir): Promise<string[]> => { return new Promise(
                                    (res, rej) => {
                                        fs.readdir(dir, (err, fmfiles) => {
                                        for (let f of fmfiles) {
                                            if (f == 'version') {
                                                log.info("Check version file " + dir + '/' + f);
                                                return fs.readFile(
                                                    dir + '/' + f,
                                                    (err, data) => {
                                                        if(err) {
                                                            res([]);
                                                        }
                                                        let vstring
                                                            = data.toString().trim();
                                                        if (semver.valid(
                                                                vstring))
                                                            return res([
                                                                dir,
                                                                vstring
                                                            ]);
                                                        else res([]);
                                                    })
                                            }
                                        }
                                        res([]);
                                    }) }) }))
                    })
                    .then(dirs => {
                        this.firmwares = dirs.filter(d => d.length == 2).map(d => {
                            return {
                                base_path: d[0], version: d[1]
                            }
                        }).sort((fm_lhs, fm_rhs) => semver.compare(fm_lhs.version, fm_rhs.version));
                        mres();
                    })
                    .catch(err => {
                        log.error('Could not fetch firmares');
                        mrej();
                    }) });
                });
    }

    getLatest(): HeadtrackerFirmware {
        return (this.firmwares.length) ? this.firmwares[this.firmwares.length - 1]: null;
    }
}

class AVRDUDEProgrammer {

    private _avrdude_executable: string;
    private _avrdude_conf: string;

    constructor()
    {
        this._avrdude_executable = 'avrdude';
    }

    async isInstalled(): Promise<boolean>
    {
        return new Promise((res, rej) => {
            cp.execFile(
                this._avrdude_executable, [ '-?' ], (err, stdout, stderr) => {
                    if (err) return rej();
                    let lines = stderr.split('\n');
                    log.info('Found AVRDUDE version '
                             + lines[lines.length - 2].split(' ')[2]);
                    res(true);
                });
        })
    }

    async flashFirmware(firmware: HeadtrackerFirmware, port: string): Promise<void> {

        await this.isInstalled();
        
        let args: string[] = [];
        
        args.push("-p");
        args.push("atmega328p")
        args.push("-c")
        args.push("arduino")
        args.push("-P")
        args.push(port)
        args.push("-b")
        args.push("57600")
        args.push("-D")
        args.push("-U")
        args.push(`flash:w:firmware.hex:i`);

        return new Promise((res, rej) => {

            log.info("Writing firmware to device. This should take just a few seconds")

            cp.execFile(this._avrdude_executable, args, { cwd: firmware.base_path }, (err, stdout, stderr) => {

                if(err){
                    console.log(err);
                    rej();
                }
    
                log.info("flash complete");
                res();
            });
        });
    }
}

function invertationToBitmask(inv: HeadtrackerInvertation)
{
    let i = 0;

    if (inv.x) i |= util.bitValue(3);
    if (inv.y) i |= util.bitValue(4);
    if (inv.z) i |= util.bitValue(5);

    return i;
}

enum si_gy_values {
    SI_GY_VALUES_MIN = 0,
    SI_GY_QUATERNION,
    SI_GY_SRATE,
    SI_GY_ALIVE,
    SI_GY_ENABLE,
    SI_GY_CONNECTED,
    SI_GY_FOUND,
    SI_GY_VERSION,
    SI_GY_HELLO,
    SI_GY_RESET,
    SI_GY_INV,
    SI_GY_RESET_ORIENTATION,
    SI_GY_INT_COUNT,
    SI_GY_VALUES_MAX
}

enum si_gy_parser_state {
    SI_PARSER_FIND_SYNC = 1,
    SI_PARSER_SYNCING,
    SI_PARSER_READ_VALUE_TYPE,
    SI_PARSER_MESSAGE_TYPE,
    SI_PARSER_READ_VALUE
}

enum si_gy_message_types {
    SI_GY_MSG_TY_MIN = 10,
    SI_GY_GET,
    SI_GY_SET,
    SI_GY_NOTIFY,
    SI_GY_RESP,
    SI_GY_ACK,
    SI_GY_MSG_TY_MAX
}

enum CON_STATE {
    OFFLINE,
    GET_VERSION,
    INIT,
    ONLINE,
    LOST
}

const si_serial_msg_lengths = [
    0,
    8,    // Quaternion
    1,    // Samplerate
    1,    // alive
    1,    // enable
    1,    // gy connected
    1,    // gy found
    3,    // gy software version
    5,    // "Hello" message
    1,    // reset
    1,    // invertation
    1,    // reset orientation
    8,    // interrupt/read counts
    0
];

const SI_SERIAL_SYNC_CODE = 0x23;

abstract class SerialConnection extends EventEmitter {

    private _serial_state: si_gy_parser_state = 0;
    private _serial_sync_count: number;
    private _serial_current_value_type: si_gy_values;
    private _serial_current_msg_type: si_gy_message_types;
    private _serial_buffer: Buffer;
    serial_port: SerialPort;

    serial_init(port: SerialPort)
    {
        this._serial_buffer
            = Buffer.alloc(Math.max(...si_serial_msg_lengths) + 5);
        this.serial_port = port;
        this._serial_reset();

        this.openSerialPort();
    }

    abstract onValueRequest(ty: si_gy_values): Buffer;
    abstract onValueSet(ty: si_gy_values, data: Buffer): void;
    abstract onNotify(ty: si_gy_values, data: Buffer): void;
    abstract onACK(ty: si_gy_values): void;
    abstract onResponse(ty: si_gy_values, data: Buffer): void;

    protected async closeSerialPort() {
        return new Promise((res, rej) => {
            this.serial_port.close(err => {
                if(err)
                    rej(err);
                else
                    res(err);
            });
        })
    }

    protected openSerialPort() {

        let self = this;

        this.serial_port.on('readable', () => {
            let data = self.serial_port.read();
            for (let char of data) self.readByte(<number>char);
        });

        this.serial_port.on('error', err => {
            log.error('Error on serial port: ' + err.message);
        });

        this.serial_port.on('close', err => {
            log.info('Serial port closed');
        });
    }

    serialNotify(val: si_gy_values)
    {
        this._serial_write_message(Buffer.alloc(si_serial_msg_lengths[val], 0),
                                   val,
                                   si_gy_message_types.SI_GY_NOTIFY);
    }

    serialSet(val: si_gy_values, data: Buffer)
    {
        this._serial_write_message(data, val, si_gy_message_types.SI_GY_SET);
    }

    serialReq(val: si_gy_values, data?: Buffer)
    {
        this._serial_write_message(
            data || Buffer.alloc(si_serial_msg_lengths[val]),
            val,
            si_gy_message_types.SI_GY_GET);
    }

    readByte(next_byte: number)
    {
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

    private _serial_write_message(buf: Buffer,
                                  ty: si_gy_values,
                                  md: si_gy_message_types)
    {
        let out_b = Buffer.alloc(si_serial_msg_lengths[ty] + 6)

        for (let i = 0; i < 4; ++i) out_b.writeUInt8(SI_SERIAL_SYNC_CODE, i);

        out_b.writeUInt8(ty, 4);
        out_b.writeUInt8(md, 5);

        buf.copy(out_b, 6, 0);
        this.serial_port.write(out_b);
    }

    private _serial_on_get_msg()
    {
        this._serial_write_message(
            this.onValueRequest(this._serial_current_value_type),
            this._serial_current_value_type,
            si_gy_message_types.SI_GY_SET);
    }

    private _serial_reset()
    {
        this._serial_state      = si_gy_parser_state.SI_PARSER_FIND_SYNC;
        this._serial_sync_count = 0;
    }

    private _serial_find_sync(byte: number)
    {
        this._serial_state      = si_gy_parser_state.SI_PARSER_SYNCING;
        this._serial_sync_count = 1;
    }

    private _serial_sync(byte: number)
    {
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

    private _serial_read_valtype(byte: number)
    {
        if (byte > si_gy_values.SI_GY_VALUES_MIN
            && byte < si_gy_values.SI_GY_VALUES_MAX) {
            this._serial_current_value_type = <si_gy_values>byte;
            this._serial_state = si_gy_parser_state.SI_PARSER_MESSAGE_TYPE;
        }
        else
            this._serial_reset();
    }

    private _serial_read_msg_type(byte: number)
    {
        this._serial_current_msg_type = <si_gy_message_types>byte;
        this._serial_state            = si_gy_parser_state.SI_PARSER_READ_VALUE
    }

    private _serial_read_value(byte: number)
    {
        if (this._serial_sync_count
            < si_serial_msg_lengths[this._serial_current_value_type] - 1)
            this._serial_buffer.writeUInt8(
                byte,
                this._serial_sync_count++);    // serial->buffer[serial->scount++]
                                               // = dat;
        else {

            /* console.log(
                'Read full value '
                + si_gy_values[this._serial_current_value_type] + ' size '
                + si_serial_msg_lengths[this._serial_current_value_type]); */

            this._serial_buffer.writeUInt8(byte, this._serial_sync_count);

            let b = Buffer.alloc(
                si_serial_msg_lengths[this._serial_current_value_type]);

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

    resolve?: (ret: Buffer)  => void;
    nresolve?: ()            => void;
    reject: (reason: string) => void;
    buf?: Buffer;
    tm?: NodeJS.Timeout;
    vty: si_gy_values;
    mty: si_gy_message_types;
    tcnt: number = 0;

    static newNotify(res: () => void, rej: () => void, val_ty: si_gy_values)
    {
        let tsk      = new HeadtrackerSerialReq();
        tsk.mty      = si_gy_message_types.SI_GY_NOTIFY;
        tsk.vty      = val_ty;
        tsk.nresolve = res;
        tsk.reject   = rej;
        return tsk;
    }

    static newSet(res: () => void,
                  rej: () => void,
                  val_ty: si_gy_values,
                  data: Buffer)
    {
        let tsk      = new HeadtrackerSerialReq();
        tsk.mty      = si_gy_message_types.SI_GY_SET;
        tsk.vty      = val_ty;
        tsk.nresolve = res;
        tsk.reject   = rej;
        tsk.buf      = data;
        return tsk;
    }

    static newReq(res: (ret: Buffer) => void,
                  rej: ()            => void,
                  val_ty: si_gy_values,
                  args: Buffer)
    {
        let tsk     = new HeadtrackerSerialReq();
        tsk.mty     = si_gy_message_types.SI_GY_GET;
        tsk.vty     = val_ty;
        tsk.resolve = res;
        tsk.reject  = rej;
        tsk.buf     = args;
        return tsk;
    }
}

export class SerialHeadtracker extends SerialConnection {

    _rqueue: HeadtrackerSerialReq[] = [];
    _req_current: HeadtrackerSerialReq;
    _req_free: boolean;
    _watchdog: NodeJS.Timeout;
    _is_ok: boolean = false;

    software_version: string;

    constructor(serial: SerialPort)
    {
        super();
        this.serial_init(serial);
    }

    last_int = 0;
    last_read_cnt = 0;

    async init()
    {
        return this.getValue(si_gy_values.SI_GY_HELLO)
            .then((data) => {
                if (data.toString() == 'hello')
                    log.info('Got valid HELLO response from Headtracker');
                else
                    log.error('Got invalid HELLO response from Headtracker');

                return this.getValue(si_gy_values.SI_GY_VERSION);
            })
            .then((data) => {

                this.software_version = `${data.readUInt8(0)}.${
                    data.readUInt8(1)}.${data.readUInt8(2)}`;

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

                            log.info(`Interrupts/s: ${cintc} read ops/s: ${crcnt}`);
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
            });
    }

    async destroy()
    {
        clearInterval(this._watchdog);

        while (this._rqueue.length)
            this._rqueue.shift().reject('Instance destroyed');

        return this.closeSerialPort();
    }

    isOnline()
    {
        return this._is_ok;
    }

    setValue(ty: si_gy_values, data: Buffer): Promise<void>
    {
        return new Promise((res, rej) => {
            this._new_request(HeadtrackerSerialReq.newSet(res, rej, ty, data));
        });
    }

    getValue(ty: si_gy_values, data?: Buffer): Promise<Buffer>
    {
        if (!data) data = Buffer.alloc(si_serial_msg_lengths[ty]).fill(13);

        log.info('Send GET ' + si_gy_values[ty]);

        return new Promise((res, rej) => {
            this._new_request(HeadtrackerSerialReq.newReq(res, rej, ty, data));
        });
    }

    notify(ty: si_gy_values): Promise<void>
    {
        return new Promise((res, rej) => {
            this._new_request(HeadtrackerSerialReq.newNotify(res, rej, ty));
        });
    }

    _start_request(req: HeadtrackerSerialReq)
    {
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
            if (req.tcnt > 40) req.reject('Timeout');
        };

        req.tm = setInterval(reqfn, 120, this);
        process.nextTick(reqfn);
        this._req_current = req;
    }

    _new_request(req: HeadtrackerSerialReq)
    {
        if (!this._req_current)
            this._start_request(req);
        else
            this._rqueue.push(req);
    }

    _end_request(data?: Buffer)
    {
        clearInterval(this._req_current.tm);

        if (data)
            this._req_current.resolve(data);
        else
            this._req_current.nresolve();

        this._req_current = null;

        if (this._rqueue.length) this._start_request(this._rqueue.shift());
    }

    /* --------------------------------------------------------------------- */

    onValueRequest(ty: si_gy_values): Buffer
    {
        return Buffer.alloc(32);
    }

    onValueSet(ty: si_gy_values, data: Buffer): void
    {
        if (ty == si_gy_values.SI_GY_QUATERNION)
            this.emit('quat', Quaternion.fromInt16Buffer(data, 0));
    }

    onNotify(ty: si_gy_values, data: Buffer): void
    {
        console.log('NOTIFY: ' + si_gy_values[ty]);
    }

    onACK(ty: si_gy_values)
    {
        if (this._req_current && this._req_current.vty == ty)
            this._end_request();
    }

    onResponse(ty: si_gy_values, data: Buffer)
    {
        if (this._req_current && this._req_current.vty == ty)
            this._end_request(data);
    }
}

export class LocalHeadtracker extends Headtracker {

    shtrk: SerialHeadtracker;
    socket: dgram.Socket;

    constructor(port: SerialPort)
    {
        super();
        this.shtrk = new SerialHeadtracker(port);
        this.remote.conf = new HeadtrackerConfigPacket();

        this.shtrk.init().then(() => {
            this.emit('update');
            this.emit('ready');
        });

        this.shtrk.on('quat', (q: Quaternion) => {

            this.socket.send(osc.toBuffer({
                oscType : 'bundle',
                elements : [
                    {
                        oscType : 'message',
                        address : '/SceneRotator/qw',
                        args : [ { type : 'float', value : q.w } ]
                    },
                    {
                        oscType : 'message',
                        address : '/SceneRotator/qx',
                        args : [ { type : 'float', value : q.x } ]
                    },
                    {
                        oscType : 'message',
                        address : '/SceneRotator/qy',
                        args : [ { type : 'float', value : q.y } ]
                    },
                    {
                        oscType : 'message',
                        address : '/SceneRotator/qz',
                        args : [ { type : 'float', value : q.z } ]
                    }
                ]
            }),
                8886,
                '127.0.0.1');
        });

        this.socket = dgram.createSocket('udp4');
    }

    async flashNewestFirmware(): Promise<void> {

        let fwman = new FirmwareManager();

        await fwman.initialize();

        if(semver.compare(fwman.getLatest().version, this.shtrk.software_version) <= 0) {
            log.info("Device already on newest software version");
            return;
        }

        let ppath = this.shtrk.serial_port.path;
        
        await this.shtrk.destroy();
        log.info("Port closed");
        log.info(`Flashing firmware version ${fwman.getLatest().version}`);
        
        let pgm = new AVRDUDEProgrammer();

        return pgm.flashFirmware(fwman.getLatest(), ppath);
    }

    setSamplerate(sr: number): void
    {
        console.log('set srate' + sr);
        this.shtrk.setValue(si_gy_values.SI_GY_SRATE, Buffer.alloc(1, sr));
    }
    enableTx(): void
    {
        this.shtrk.setValue(si_gy_values.SI_GY_ENABLE, Buffer.alloc(1, 1));
    }
    disableTx(): void
    {
        this.shtrk.setValue(si_gy_values.SI_GY_ENABLE, Buffer.alloc(1, 0));
    }
    save(): void
    {
        console.log('Would save locally here');
    }
    reboot():
        void{ this.shtrk.getValue(si_gy_values.SI_GY_RESET).then(err => {
            this.shtrk.destroy();
            this.shtrk.init();
        }) } setInvertation(inv: HeadtrackerInvertation): void
    {
        this.shtrk.setValue(
            si_gy_values.SI_GY_INV, Buffer.alloc(1, invertationToBitmask(inv)));
    }
    resetOrientation(): void
    {
        this.shtrk.setValue(
            si_gy_values.SI_GY_RESET_ORIENTATION, Buffer.alloc(1, 1));
    }
    applyNetworkSettings(settings: HeadtrackerNetworkSettings): void
    {
        log.error('Cannot set network settings on serial headtracker');
    }
    destroy()
    {
        this.shtrk.destroy();
    }
    isOnline()
    {
        return this.shtrk.isOnline();
    }
    setStreamDest(addr: string, port: number)
    {
        log.error('Cannot set stream destination on serial headtracker');
    }
}