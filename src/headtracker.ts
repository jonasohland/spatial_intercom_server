import EventEmitter from 'events';

export enum HTRKDevState {
    INITIALIZING,
    CONNECTED,
    CONNECTING,
    BUSY,
    TIMEOUT,
    ID_CONFLICT,
    DISCONNECTED,
}

export enum HeadtrackerConfigFlags {
    UPDATE         = 1,
    REBOOT         = 2,
    STREAM_ENABLED = 4,
    CALIBRATE      = 8,
    RESET_WORLD    = 16,
    NON_REQUEST    = 64,
    DUMP_DATA      = 128,
}

export enum HeadtrackerNetworkFlags {
    DHCP = 1
}

export enum HeadtrackerStateFlags {
    GY_PRESENT        = 1,
    GY_RDY            = 2,
    RESET_ORIENTATION = 4,
    INVERT_X          = 8,
    INVERT_Y          = 16,
    INVERT_Z          = 32
}

export interface HeadtrackerNetworkSettings {
    id: number
    addr: string, subnet: string, dhcp: boolean
}

export interface HeadtrackerInvertation {
    x: boolean, y: boolean, z: boolean
}

export function stringToAddr(addr: string)
{
    let arr = Buffer.alloc(4);

    let vals = addr.split('.').map(v => Number.parseInt(v));

    if (vals.length != 4 || vals.filter(v => v > 255).length)
        throw new Error('Not a valid ipv4 address string');

    for (let i in vals) arr.writeUInt8(vals[i], Number.parseInt(i));

    return arr.readUInt32LE(0);
}

export function addrToString(addr: number)
{
    let arr = new ArrayBuffer(4);

    let v = new DataView(arr);

    v.setUint32(0, addr);

    return `${v.getUint8(3)}.${v.getUint8(2)}.${v.getUint8(1)}.${
        v.getUint8(0)}`;
}

class EulerAngles {
    constructor(y: number, p: number, r: number)
    {
        this.yaw   = y;
        this.pitch = p;
        this.roll  = r;
    }

    yaw: number;
    pitch: number;
    roll: number;

    toQuaternion()
    {
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

class Quaternion {
    w: number;
    x: number;
    y: number;
    z: number;

    constructor(w: number, x: number, y: number, z: number)
    {
        this.w = w;
        this.x = x;
        this.y = y;
        this.z = z;
    }

    toEuler(): EulerAngles
    {
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

export class HeadtrackerConfigPacket {

    device_config: number  = 0;
    network_config: number = 0;
    device_state: number   = 0;
    sample_rate: number    = 0;

    stream_dest_addr: string = '0.0.0.0';
    stream_dest_port: number = 0;

    sequence_num: number = 0;

    device_static_ip: string;
    device_static_subnet: string;

    constructor() {}

    setDeviceFlag(flag: HeadtrackerConfigFlags): HeadtrackerConfigPacket
    {
        this.device_config |= flag;
        return this;
    }

    clearDeviceFlag(flag: HeadtrackerConfigFlags): HeadtrackerConfigPacket
    {
        this.device_config &= ~flag;
        return this;
    }

    isDeviceFlagSet(flag: HeadtrackerConfigFlags): boolean
    {
        return (this.device_config & flag) > 0;
    }

    setNetworkFlag(flag: HeadtrackerNetworkFlags): HeadtrackerConfigPacket
    {
        this.network_config |= flag;
        return this;
    }

    clearNetworkFlag(flag: HeadtrackerNetworkFlags): HeadtrackerConfigPacket
    {
        this.network_config &= ~flag;
        return this;
    }

    isNetworkFlagSet(flag: HeadtrackerNetworkFlags): boolean
    {
        return (this.network_config & flag) > 0;
    }

    setStateFlag(flag: HeadtrackerStateFlags): HeadtrackerConfigPacket
    {
        this.device_state |= flag;
        return this;
    }

    clearStateFlag(flag: HeadtrackerStateFlags): HeadtrackerConfigPacket
    {
        this.device_state &= ~flag;
        return this;
    }

    isStateFlagSet(flag: HeadtrackerStateFlags): boolean
    {
        return (this.device_state & flag) > 0;
    }

    deviceID()
    {
        return this.network_config >> 2;
    }

    setDeviceID(id: number)
    {
        this.network_config &= ~(63 << 2);
        this.network_config |= (id << 2);
    }

    toBuffer(): Buffer
    {
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

        if (!opt_fields) return b;

        b.writeUInt32LE(stringToAddr(this.device_static_ip), 16);
        b.writeUInt32LE(stringToAddr(this.device_static_subnet), 20);

        return b;
    }

    static check(buf: Buffer)
    {
        return buf.length >= 16 && buf.readUInt32LE(0) == 0x3f39e3cc;
    }

    static fromBuffer(buf: Buffer)
    {
        let packet = new HeadtrackerConfigPacket();

        packet.device_config    = buf.readUInt8(4);
        packet.network_config   = buf.readUInt8(5);
        packet.device_state     = buf.readUInt8(6);
        packet.sample_rate      = buf.readUInt8(7);
        packet.stream_dest_addr = addrToString(buf.readUInt32LE(8));
        packet.stream_dest_port = buf.readUInt16LE(12);
        packet.sequence_num     = buf.readUInt16LE(14);

        if (buf.length <= 16) return packet;

        packet.device_static_ip     = addrToString(buf.readUInt32LE(16));
        packet.device_static_subnet = addrToString(buf.readUInt32LE(20));

        return packet;
    }
}

export class HeadtrackerDataPacket {

    device_id: number;
    w: number;
    x: number;
    y: number;
    z: number;

    static check(m: Buffer) {}

    static fromBuffer(m: Buffer)
    {
        let p = new HeadtrackerDataPacket();

        p.device_id = m.readUInt16LE(4);
        p.w         = m.readUInt16LE(6);
        p.x         = m.readUInt16LE(8);
        p.y         = m.readUInt16LE(10);
        p.z         = m.readUInt16LE(12);
    }

    getQuaternion()
    {
        return new Quaternion(this.w, this.x, this.y, this.z);
    }

    getEuler()
    {
        return this.getQuaternion().toEuler();
    }
}

export abstract class Headtracker extends EventEmitter {

    remote: {
        conf?: HeadtrackerConfigPacket;
        state?: HTRKDevState;
        id?: number;
        addr?: string;
        port?: number;
    }
    = {};

    local: { conf?: HeadtrackerConfigPacket; port?: number; netif?: string; }
    = {};

    abstract setSamplerate(sr: number): void; 
    abstract enableTx(): void;
    abstract disableTx(): void;
    abstract save(): void;
    abstract reboot(): void;
    abstract setInvertation(inv: HeadtrackerInvertation): void;
    abstract resetOrientation(): void;
    abstract applyNetworkSettings(settings: HeadtrackerNetworkSettings): void;
    abstract destroy(): void;
    abstract isOnline(): boolean;
    abstract setStreamDest(addr: string, port: number): void;
}