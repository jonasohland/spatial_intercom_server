import SerialPort from "serialport";
import * as Logger from "./log";

const log = Logger.get("SHK")

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
    SI_GY_GET = 1,
    SI_GY_SET,
    SI_GY_NOTIFY
}

const si_serial_msg_lengths = [ 
    16, // Quaternion
    1,  // Samplerate
    1,  // alive
    1,  // enable
    1,  // gy connected
    1,  // gy found
    3,  // gy software version
    5,  // "Hello" message
];

const SI_SERIAL_SYNC_CODE = 0x23

abstract class SerialConnection {

    private _serial_state: si_gy_parser_state = 0;
    private _serial_sync_count: number;
    private _serial_current_value_type: si_gy_values;
    private _serial_current_msg_type: si_gy_message_types;
    private _serial_buffer: Buffer;
    private _serial_port: SerialPort;

    constructor(port: SerialPort) {
        
        let self = this;
        
        this._serial_buffer = Buffer.alloc(Math.max(...si_serial_msg_lengths) + 5);
        this._serial_port = port;
        this._serial_reset();

        this._serial_port.on('readable', () => {
            
            let data = self._serial_port.read();

             for(let char of data)
                self.readByte(<number> char);
        });

        this._serial_port.on('error', err => {
            log.error("Error on serial port: " + err.message);
        });
    
        this._serial_port.on('close', err => {
            log.info("Serial port closed");
        });
    }

    abstract onValueRequest(ty: si_gy_values): Buffer;
    abstract onValueSet(ty: si_gy_values, data: Buffer): void;
    abstract onNotify(ty: si_gy_values, data: Buffer): void;

    readByte(next_byte: number) {
        switch(this._serial_state) {
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

    private _serial_write_message(buf: Buffer, ty: si_gy_values, md: si_gy_message_types) {
        
        let out_b = Buffer.alloc(si_serial_msg_lengths[ty] + 5)
        
        for(let i = 0; i < 4; ++i)
            out_b.writeUInt8(SI_SERIAL_SYNC_CODE, i);
    
        out_b.writeUInt8(ty, 4);
        out_b.writeUInt8(md, 5);
        buf.copy(out_b, 6, 0);

        this._serial_port.write(out_b);
    }

    private _serial_on_get_msg() {
        this._serial_write_message(
            this.onValueRequest(this._serial_current_value_type), 
            this._serial_current_value_type, si_gy_message_types.SI_GY_SET);
    }   

    private _serial_reset() {
        this._serial_state = si_gy_parser_state.SI_PARSER_FIND_SYNC;
        this._serial_sync_count = 0;
    }

    private _serial_find_sync(byte: number) {
        this._serial_state = si_gy_parser_state.SI_PARSER_SYNCING;
        this._serial_sync_count = 1;
    }

    private _serial_sync(byte: number) {

        if (this._serial_sync_count < 3) {

            if (byte == SI_SERIAL_SYNC_CODE)
                this._serial_sync_count++;
            else
                this._serial_reset();
        }
        else if (this._serial_sync_count == 3) {
    
            this._serial_state  = si_gy_parser_state.SI_PARSER_READ_VALUE_TYPE;
            this._serial_sync_count = 0;
        }
        else
            this._serial_reset();
    }

    private _serial_read_valtype(byte: number) {
        if (byte > si_gy_values.SI_GY_VALUES_MIN && byte < si_gy_values.SI_GY_VALUES_MAX) {
            this._serial_current_value_type  = <si_gy_values> byte;
            this._serial_state = si_gy_parser_state.SI_PARSER_MESSAGE_TYPE;
        }
        else
            this._serial_reset();
    }

    private _serial_read_msg_type(byte: number) {
        this._serial_current_msg_type = <si_gy_message_types> byte;
        this._serial_state = si_gy_parser_state.SI_PARSER_READ_VALUE
    }

    private _serial_read_value(byte: number) {

        if (this._serial_sync_count < si_serial_msg_lengths[this._serial_current_value_type - 1] - 1)
            this._serial_buffer.writeUInt8(byte, this._serial_sync_count++)//serial->buffer[serial->scount++] = dat;
        else {
            this._serial_buffer.writeUInt8(byte, this._serial_sync_count)

            let b = Buffer.alloc(si_serial_msg_lengths[this._serial_current_value_type]);
            this._serial_buffer.copy(b, 0, 5);
            
            switch(this._serial_current_msg_type) {
                case si_gy_message_types.SI_GY_SET:
                    this.onValueSet(this._serial_current_value_type, b);
                    break;
                case si_gy_message_types.SI_GY_NOTIFY:
                    this.onNotify(this._serial_current_value_type, b);
                    break;
                case si_gy_message_types.SI_GY_GET:
                    this._serial_on_get_msg();
            }    
        
            this._serial_reset();
        }
    }
}

export class LocalHeadtracker extends SerialConnection {

    constructor(serial: SerialPort) {
        super(serial);
    }

    handleMessage(ty: si_gy_values, buf: Buffer): void {
        console.log(si_gy_values[ty]);
    }
}