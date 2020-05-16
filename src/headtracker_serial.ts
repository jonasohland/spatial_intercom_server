import SerialPort from 'serialport';

import {Headtracker} from './headtracker';
import * as Logger from './log';
import * as util from './util';

const log = Logger.get('SHK');

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
    16,    // Quaternion
    1,     // Samplerate
    1,     // alive
    1,     // enable
    1,     // gy connected
    1,     // gy found
    3,     // gy software version
    5,     // "Hello" message
    1,     // reset
    0
];

const SI_SERIAL_SYNC_CODE = 0x23;

abstract class SerialConnection {

    private _serial_state: si_gy_parser_state = 0;
    private _serial_sync_count: number;
    private _serial_current_value_type: si_gy_values;
    private _serial_current_msg_type: si_gy_message_types;
    private _serial_buffer: Buffer;
    private _serial_port: SerialPort;

    serial_init(port: SerialPort)
    {
        let self = this;

        this._serial_buffer
            = Buffer.alloc(Math.max(...si_serial_msg_lengths) + 5);
        this._serial_port = port;
        this._serial_reset();

        this._serial_port.on('readable', () => {
            let data = self._serial_port.read();
            // process.stdout.write("data_in: ");
            // console.log(data);
            for (let char of data) self.readByte(<number>char);
        });

        this._serial_port.on('error', err => {
            log.error('Error on serial port: ' + err.message);
        });

        this._serial_port.on('close', err => {
            log.info('Serial port closed');
        });
    }

    abstract onValueRequest(ty: si_gy_values): Buffer;
    abstract onValueSet(ty: si_gy_values, data: Buffer): void;
    abstract onNotify(ty: si_gy_values, data: Buffer): void;
    abstract onACK(ty: si_gy_values): void;
    abstract onResponse(ty: si_gy_values, data: Buffer): void;

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
        this._serial_port.write(out_b);
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

export class LocalHeadtracker {

    _rqueue: HeadtrackerSerialReq[] = [];
    _req_current: HeadtrackerSerialReq;
    _req_free: boolean;

    constructor(serial: SerialPort)
    {
        this.serial_init(serial);

        setTimeout(() => {
            this._get_value(si_gy_values.SI_GY_HELLO).then((data) => {

                if(data.toString() == 'hello')
                    log.info("Got valid HELLO response from Headtracker");
                else
                    log.error("Got invalid HELLO response from Headtracker");

                return this._get_value(si_gy_values.SI_GY_VERSION);
            }).then((data) => {
                log.info(`Headtracker software version: ${data.readUInt8(0)}.${data.readUInt8(1)}.${data.readUInt8(2)}`);
            }); 
        }, 1000, this);
    }

    _set_value(ty: si_gy_values, data: Buffer): Promise<void>
    {
        return new Promise((res, rej) => {
            this._new_request(HeadtrackerSerialReq.newSet(res, rej, ty, data));
        });
    }

    _get_value(ty: si_gy_values, data?: Buffer): Promise<Buffer>
    {
        if (!data) data = Buffer.alloc(si_serial_msg_lengths[ty]).fill(13);

        log.info("Send GET " + si_gy_values[ty]);

        return new Promise((res, rej) => {
            this._new_request(HeadtrackerSerialReq.newReq(res, rej, ty, data));
        });
    }

    _notify(ty: si_gy_values): Promise<void>
    {
        return new Promise((res, rej) => {
            this._new_request(HeadtrackerSerialReq.newNotify(res, rej, ty));
        });
    }

    _start_request(req: HeadtrackerSerialReq)
    {
        req.tm = setInterval(() => {
            switch (req.mty) {
                case si_gy_message_types.SI_GY_GET:
                    this.serialReq(req.vty, req.buf);
                    break;
                case si_gy_message_types.SI_GY_SET:
                    this.serialSet(req.vty, req.buf);
                    break;
                case si_gy_message_types.SI_GY_NOTIFY:
                    this.serialNotify(req.vty);
            }
        }, 120, this);

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
        // prevent any more ACK matches for this request
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

    onValueSet(ty: si_gy_values, data: Buffer): void {}

    onNotify(ty: si_gy_values, data: Buffer): void {}

    onACK(ty: si_gy_values)
    {
        if (this._req_current.vty == ty) this._end_request();
    }

    onResponse(ty: si_gy_values, data: Buffer)
    {
        if (this._req_current.vty == ty) this._end_request(data);
    }
}

// Hacky version of multiple inheritance...
export interface LocalHeadtracker extends Headtracker, SerialConnection {
}

// this is an offical workaround...
util.applyMixins(LocalHeadtracker, [ SerialConnection, Headtracker ]);