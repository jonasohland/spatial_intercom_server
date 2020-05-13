import SerialPort from 'serialport';
import * as Logger from './log';
import { Headtracker } from './headtracker';

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
    SI_GY_MSG_TY_MIN = 1,
    SI_GY_GET,
    SI_GY_SET,
    SI_GY_NOTIFY,
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

    private _serial_con_s: CON_STATE;

    serial_init(port: SerialPort) 
    {
        let self = this;

        this._serial_buffer
            = Buffer.alloc(Math.max(...si_serial_msg_lengths) + 5);
        this._serial_port = port;
        this._serial_reset();

        this._serial_port.on('readable', () => {
            let data = self._serial_port.read();
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

    serialNotify(val: si_gy_values)
    {
        this._serial_write_message(
            Buffer.alloc(1), val, si_gy_message_types.SI_GY_NOTIFY);
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
                case si_gy_message_types.SI_GY_GET: this._serial_on_get_msg();
            }

            this._serial_reset();
        }
    }
}

function applyMixins(derivedCtor: any, baseCtors: any[]) {
    baseCtors.forEach(baseCtor => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            Object.defineProperty(derivedCtor.prototype, name, Object.getOwnPropertyDescriptor(baseCtor.prototype, name));
        });
    });
}


export class LocalHeadtracker {

    _con_state = CON_STATE.GET_VERSION;
    _req_int: NodeJS.Timeout;
    _req_tmt: number           = 200;
    _req_max_retry_cnt: number = 10;
    _req_retry_cnt: number     = 0;

    constructor(serial: SerialPort)
    {
        this.serial_init(serial);

        // wait a few seconds for the atmega to boot
        setTimeout(() => {
            this._init_req(4000, 10);
            this._start_getver();
        }, 3000, this);
    }

    _start_getver()
    {
        this._start_req(CON_STATE.GET_VERSION);
        this.serialReq(si_gy_values.SI_GY_VERSION);
    }

    _start_init()
    {
        this._start_req(CON_STATE.INIT);
        this.serialReq(si_gy_values.SI_GY_HELLO);
    }

    _init_req(tmt: number, max_tmt: number)
    {
        this._req_max_retry_cnt = max_tmt;
        this._req_tmt           = tmt;
        this._req_retry_cnt     = 0;
    }

    _start_req(st: CON_STATE)
    {
        this._con_state = st;
        this._req_int
            = setTimeout(this._on_req_timeout.bind(this), this._req_tmt);
    }

    _reset_req()
    {
        clearTimeout(this._req_int);
    }

    _on_req_timeout()
    {
        log.warn(`Request in state ${CON_STATE[this._con_state]} timed out`);

        this._req_retry_cnt++;

        switch (this._con_state) {
            case CON_STATE.GET_VERSION: return this._start_getver();
            case CON_STATE.INIT: this._start_init();
            case CON_STATE.ONLINE: break;
            case CON_STATE.LOST: break;
            case CON_STATE.OFFLINE: break;
        }
    }

    /* --------------------------------------------------------------------- */

    private _on_set_ver(data: Buffer)
    {
        if (this._con_state == CON_STATE.GET_VERSION) {
            let vstr = `${data.readUInt8(0)}.${data.readUInt8(1)}.${
                data.readUInt8(2)}`;

            log.info('Headtracker software version: ' + vstr);

            this._reset_req();
            this._init_req(400, 10);
            this._start_init();
        }
    }

    private _on_set_hello(data: Buffer)
    {
        if (this._con_state = CON_STATE.INIT) {

            let hello = data.toString();
            this._reset_req();

            if (hello == 'hello') {

                log.info(`Received valid ${
                    si_gy_values[si_gy_values.SI_GY_HELLO]} message`);
                    
                this._con_state = CON_STATE.ONLINE;
                this.setDefaults();
            }
        }
    }

    /* --------------------------------------------------------------------- */

    setDefaults()
    {
        log.info('Setting Headtracker to default values');
        this.serialSet(si_gy_values.SI_GY_ENABLE, Buffer.from([ 0 ]));
        this.serialSet(si_gy_values.SI_GY_SRATE, Buffer.from([ 25 ]));
    }

    onValueRequest(ty: si_gy_values): Buffer
    {
        return Buffer.alloc(32);
    }

    onValueSet(ty: si_gy_values, data: Buffer): void
    {
        switch (ty) {
            case si_gy_values.SI_GY_VERSION: return this._on_set_ver(data);
            case si_gy_values.SI_GY_HELLO: return this._on_set_hello(data);
        }
    }
    onNotify(ty: si_gy_values, data: Buffer): void
    {
        console.log('Notified ' + si_gy_values[ty]);
    }
}

// Hacky version of multiple inheritance...
export interface LocalHeadtracker extends Headtracker, SerialConnection {};
applyMixins(LocalHeadtracker, [Headtracker, SerialConnection]);