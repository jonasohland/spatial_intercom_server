import SerialPort from "serialport";

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
    SI_PARSER_READ_VALUE
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
    private _serial_buffer: Buffer;

    constructor(port: SerialPort) {
        this._serial_buffer = Buffer.alloc(32);
        this._serial_reset();
    }

    abstract handleQuat(): void;

    private _serial_call_handler() {
        console.log("Calling Handler for: " + si_gy_values[this._serial_current_value_type])
    }

    readByte(next_byte: number) {
        switch(this._serial_state) {
            case si_gy_parser_state.SI_PARSER_FIND_SYNC:
                return this._serial_find_sync(next_byte);
            case si_gy_parser_state.SI_PARSER_SYNCING:
                return this._serial_sync(next_byte);
            case si_gy_parser_state.SI_PARSER_READ_VALUE_TYPE:
                return this._serial_read_valtype(next_byte);
            case si_gy_parser_state.SI_PARSER_READ_VALUE:
                return this._serial_read_value(next_byte);
        }
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
            this._serial_state = si_gy_parser_state.SI_PARSER_READ_VALUE;
            console.log("Value type is " + si_gy_values[this._serial_current_value_type]);
        }
        else
            this._serial_reset();
    }

    private _serial_read_value(byte: number) {

        if (this._serial_sync_count < si_serial_msg_lengths[this._serial_current_value_type - 1] - 1)
            this._serial_buffer.writeUInt8(byte, this._serial_sync_count++)//serial->buffer[serial->scount++] = dat;
        else {
            this._serial_buffer.writeUInt8(byte, this._serial_sync_count)
            this._serial_call_handler();
            this._serial_reset();
        }
    }
}

export class LocalHeadtracker extends SerialConnection {

    constructor(serial: SerialPort) {
        super(serial);
    }

    handleQuat(): void {
        
    }
}