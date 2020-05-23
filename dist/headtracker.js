"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = __importDefault(require("events"));
var HTRKDevState;
(function (HTRKDevState) {
    HTRKDevState[HTRKDevState["INITIALIZING"] = 0] = "INITIALIZING";
    HTRKDevState[HTRKDevState["CONNECTED"] = 1] = "CONNECTED";
    HTRKDevState[HTRKDevState["CONNECTING"] = 2] = "CONNECTING";
    HTRKDevState[HTRKDevState["BUSY"] = 3] = "BUSY";
    HTRKDevState[HTRKDevState["TIMEOUT"] = 4] = "TIMEOUT";
    HTRKDevState[HTRKDevState["ID_CONFLICT"] = 5] = "ID_CONFLICT";
    HTRKDevState[HTRKDevState["DISCONNECTED"] = 6] = "DISCONNECTED";
})(HTRKDevState = exports.HTRKDevState || (exports.HTRKDevState = {}));
var HeadtrackerConfigFlags;
(function (HeadtrackerConfigFlags) {
    HeadtrackerConfigFlags[HeadtrackerConfigFlags["UPDATE"] = 1] = "UPDATE";
    HeadtrackerConfigFlags[HeadtrackerConfigFlags["REBOOT"] = 2] = "REBOOT";
    HeadtrackerConfigFlags[HeadtrackerConfigFlags["STREAM_ENABLED"] = 4] = "STREAM_ENABLED";
    HeadtrackerConfigFlags[HeadtrackerConfigFlags["CALIBRATE"] = 8] = "CALIBRATE";
    HeadtrackerConfigFlags[HeadtrackerConfigFlags["RESET_WORLD"] = 16] = "RESET_WORLD";
    HeadtrackerConfigFlags[HeadtrackerConfigFlags["NON_REQUEST"] = 64] = "NON_REQUEST";
    HeadtrackerConfigFlags[HeadtrackerConfigFlags["DUMP_DATA"] = 128] = "DUMP_DATA";
})(HeadtrackerConfigFlags = exports.HeadtrackerConfigFlags || (exports.HeadtrackerConfigFlags = {}));
var HeadtrackerNetworkFlags;
(function (HeadtrackerNetworkFlags) {
    HeadtrackerNetworkFlags[HeadtrackerNetworkFlags["DHCP"] = 1] = "DHCP";
})(HeadtrackerNetworkFlags = exports.HeadtrackerNetworkFlags || (exports.HeadtrackerNetworkFlags = {}));
var HeadtrackerStateFlags;
(function (HeadtrackerStateFlags) {
    HeadtrackerStateFlags[HeadtrackerStateFlags["GY_PRESENT"] = 1] = "GY_PRESENT";
    HeadtrackerStateFlags[HeadtrackerStateFlags["GY_RDY"] = 2] = "GY_RDY";
    HeadtrackerStateFlags[HeadtrackerStateFlags["RESET_ORIENTATION"] = 4] = "RESET_ORIENTATION";
    HeadtrackerStateFlags[HeadtrackerStateFlags["INVERT_X"] = 8] = "INVERT_X";
    HeadtrackerStateFlags[HeadtrackerStateFlags["INVERT_Y"] = 16] = "INVERT_Y";
    HeadtrackerStateFlags[HeadtrackerStateFlags["INVERT_Z"] = 32] = "INVERT_Z";
})(HeadtrackerStateFlags = exports.HeadtrackerStateFlags || (exports.HeadtrackerStateFlags = {}));
function stringToAddr(addr) {
    let arr = Buffer.alloc(4);
    let vals = addr.split('.').map(v => Number.parseInt(v));
    if (vals.length != 4 || vals.filter(v => v > 255).length)
        throw new Error('Not a valid ipv4 address string');
    for (let i in vals)
        arr.writeUInt8(vals[i], Number.parseInt(i));
    return arr.readUInt32LE(0);
}
exports.stringToAddr = stringToAddr;
function addrToString(addr) {
    let arr = new ArrayBuffer(4);
    let v = new DataView(arr);
    v.setUint32(0, addr);
    return `${v.getUint8(3)}.${v.getUint8(2)}.${v.getUint8(1)}.${v.getUint8(0)}`;
}
exports.addrToString = addrToString;
class EulerAngles {
    constructor(y, p, r) {
        this.yaw = y;
        this.pitch = p;
        this.roll = r;
    }
    toQuaternion() {
        let cy = Math.cos(this.yaw * 0.5);
        let sy = Math.sin(this.yaw * 0.5);
        let cp = Math.cos(this.pitch * 0.5);
        let sp = Math.sin(this.pitch * 0.5);
        let cr = Math.cos(this.roll * 0.5);
        let sr = Math.sin(this.roll * 0.5);
        let q = new Quaternion(0, 0, 0, 0);
        q.w = cy * cp * cr + sy * sp * sr;
        q.x = cy * cp * sr - sy * sp * cr;
        q.y = sy * cp * sr + cy * sp * cr;
        q.z = sy * cp * cr - cy * sp * sr;
        return q;
    }
}
exports.EulerAngles = EulerAngles;
class Quaternion {
    constructor(w, x, y, z) {
        this.w = w;
        this.x = x;
        this.y = y;
        this.z = z;
    }
    static fromBuffer(buffer, offset) {
        return new Quaternion(buffer.readFloatLE(offset), buffer.readFloatLE(offset + 4), buffer.readFloatLE(offset + 8), buffer.readFloatLE(offset + 12));
    }
    static fromInt16Buffer(buffer, offset) {
        let iw = buffer.readInt16LE(offset);
        let ix = buffer.readInt16LE(offset + 2);
        let iy = buffer.readInt16LE(offset + 4);
        let iz = buffer.readInt16LE(offset + 6);
        return new Quaternion(iw / 16384, ix / 16384, iy / 16384, iz / 16384);
    }
    toEuler() {
        let euler = new EulerAngles(0, 0, 0);
        let sinr_cosp = 2 * (this.w * this.x + this.y * this.z);
        let cosr_cosp = 1 - 2 * (this.x * this.x + this.y * this.y);
        euler.roll = Math.atan2(sinr_cosp, cosr_cosp);
        let sinp = 2 * (this.w * this.y - this.z * this.x);
        if (Math.abs(sinp) >= 1)
            euler.pitch = (Math.PI / 2) * (sinp < 0 ? -1 : 1);
        else
            euler.pitch = Math.asin(sinp);
        let siny_cosp = 2 * (this.w * this.z + this.x * this.y);
        let cosy_cosp = 1 - 2 * (this.y * this.y + this.z * this.z);
        euler.yaw = Math.atan2(siny_cosp, cosy_cosp);
        return euler;
    }
}
exports.Quaternion = Quaternion;
class HeadtrackerConfigPacket {
    constructor() {
        this.device_config = 0;
        this.network_config = 0;
        this.device_state = 0;
        this.sample_rate = 0;
        this.stream_dest_addr = '0.0.0.0';
        this.stream_dest_port = 0;
        this.sequence_num = 0;
    }
    setDeviceFlag(flag) {
        this.device_config |= flag;
        return this;
    }
    clearDeviceFlag(flag) {
        this.device_config &= ~flag;
        return this;
    }
    isDeviceFlagSet(flag) {
        return (this.device_config & flag) > 0;
    }
    setNetworkFlag(flag) {
        this.network_config |= flag;
        return this;
    }
    clearNetworkFlag(flag) {
        this.network_config &= ~flag;
        return this;
    }
    isNetworkFlagSet(flag) {
        return (this.network_config & flag) > 0;
    }
    setStateFlag(flag) {
        this.device_state |= flag;
        return this;
    }
    clearStateFlag(flag) {
        this.device_state &= ~flag;
        return this;
    }
    isStateFlagSet(flag) {
        return (this.device_state & flag) > 0;
    }
    deviceID() {
        return this.network_config >> 2;
    }
    setDeviceID(id) {
        this.network_config &= ~(63 << 2);
        this.network_config |= (id << 2);
    }
    toBuffer() {
        let opt_fields = this.device_static_ip != undefined
            && this.device_static_ip.length
            && this.device_static_subnet != undefined
            && this.device_static_subnet.length;
        let b = Buffer.alloc(opt_fields ? 24 : 16);
        b.writeUInt32LE(0x3f39e3cc, 0);
        b.writeUInt8(this.device_config, 4);
        b.writeUInt8(this.network_config, 5);
        b.writeUInt8(this.device_state, 6);
        b.writeUInt8(this.sample_rate, 7);
        b.writeUInt32LE(stringToAddr(this.stream_dest_addr), 8);
        b.writeUInt16LE(this.stream_dest_port, 12);
        b.writeUInt16LE(this.sequence_num, 14);
        if (!opt_fields)
            return b;
        b.writeUInt32LE(stringToAddr(this.device_static_ip), 16);
        b.writeUInt32LE(stringToAddr(this.device_static_subnet), 20);
        return b;
    }
    static check(buf) {
        return buf.length >= 16 && buf.readUInt32LE(0) == 0x3f39e3cc;
    }
    static fromBuffer(buf) {
        let packet = new HeadtrackerConfigPacket();
        packet.device_config = buf.readUInt8(4);
        packet.network_config = buf.readUInt8(5);
        packet.device_state = buf.readUInt8(6);
        packet.sample_rate = buf.readUInt8(7);
        packet.stream_dest_addr = addrToString(buf.readUInt32LE(8));
        packet.stream_dest_port = buf.readUInt16LE(12);
        packet.sequence_num = buf.readUInt16LE(14);
        if (buf.length <= 16)
            return packet;
        packet.device_static_ip = addrToString(buf.readUInt32LE(16));
        packet.device_static_subnet = addrToString(buf.readUInt32LE(20));
        return packet;
    }
}
exports.HeadtrackerConfigPacket = HeadtrackerConfigPacket;
class HeadtrackerDataPacket {
    constructor(id, vals) {
        this.device_id = id;
        this.w = vals[0];
        this.x = vals[0];
        this.y = vals[0];
        this.z = vals[0];
    }
    static check(m) { }
    static fromBuffer(m) {
        let p = new HeadtrackerDataPacket(m.readUInt16LE(4), [
            m.readUInt16LE(6),
            m.readUInt16LE(8),
            m.readUInt16LE(10),
            m.readUInt16LE(12)
        ]);
    }
    toBuffer() {
        let ob = Buffer.alloc(14);
        ob.writeUInt16LE(this.device_id, 4);
        ob.writeUInt16LE(this.w, 6);
        ob.writeUInt16LE(this.x, 8);
        ob.writeUInt16LE(this.y, 10);
        ob.writeUInt16LE(this.z, 12);
        return ob;
    }
    static newPacketFromFloatLEData(b, dataoffs, id) {
        return new HeadtrackerDataPacket(id, [
            b.readFloatLE(dataoffs) * 16384,
            b.readFloatLE(dataoffs + 4) * 16384,
            b.readFloatLE(dataoffs + 8) * 16384,
            b.readFloatLE(dataoffs + 12) * 16384
        ]).toBuffer();
    }
    static newPackerFromInt16Data(b, dataoffs, id) {
        let ob = Buffer.alloc(14);
        ob.writeInt16LE(id, 4);
        b.copy(ob, 6, dataoffs, dataoffs + 8);
        return ob;
    }
    getQuaternion() {
        return new Quaternion(this.w, this.x, this.y, this.z);
    }
    getEuler() {
        return this.getQuaternion().toEuler();
    }
}
exports.HeadtrackerDataPacket = HeadtrackerDataPacket;
class Headtracker extends events_1.default {
    constructor() {
        super(...arguments);
        this.remote = {};
        this.local = {};
    }
}
exports.Headtracker = Headtracker;
//# sourceMappingURL=headtracker.js.map