import {createSocket as createDgramSocket, Socket} from 'dgram';
import dnssd from 'dnssd';
import EventEmitter from 'events';

import * as Logger from './log';

// import mkbonjour, { Bonjour, Browser } from 'bonjour-hap';

let comCheckInterval = 10000;

const log = Logger.get('HTK');

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

export interface HeadtrackerInvertation {
    x: boolean, y: boolean, z: boolean
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

interface HeadtrackerNetworkSettings {
    id: number
    addr: string, subnet: string, dhcp: boolean
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

enum HTRKDevState {
    INITIALIZING,
    CONNECTED,
    CONNECTING,
    BUSY,
    TIMEOUT,
    ID_CONFLICT,
    DISCONNECTED,
}

enum HTRKMsgState {
    WAITING,
    SAVING,
    READY,
}

class HeadtrackerUpdateCallback {

    constructor(seq: number, cb: (id: number) => void)
    {
        this.seq      = seq;
        this.callback = cb;
    }

    seq: number;
    callback: (t_id: number) => void;
}

class HeadtrackerCallbackQueue {

    queue: HeadtrackerUpdateCallback[];

    call(seq: number, id: number)
    {
        let i = this.queue.findIndex(el => el.seq == seq);

        if (i != -1) this.queue.splice(i, 1)[0].callback(id);
    }

    add(cb: HeadtrackerUpdateCallback)
    {
        this.queue.push(cb);
    }
}

/**
 * @fires Headtracker#saved when the currernt configuration was saved to the
 * device
 */
export class Headtracker extends EventEmitter {
    msg_state: HTRKMsgState;

    update_required: boolean;
    dumping: boolean;
    resetting_orientation: boolean;

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

    response_timeout: NodeJS.Timeout;
    check_alive_timeout: NodeJS.Timeout;

    socket: Socket;
    server: SocketIO.Server;

    constructor(server: SocketIO.Server,
                id: number,
                addr: string,
                port: number,
                local_port: number,
                netif?: string)
    {
        super();

        this._setState(HTRKDevState.DISCONNECTED);

        this.remote.addr = addr;
        this.remote.port = port;
        this.remote.id   = id;

        this.dumping = false;

        this.local.port  = local_port;
        this.local.netif = netif;

        this.socket = createDgramSocket('udp4');
        this.server = server;

        this.socket.on('close', this._onClose.bind(this));
        this.socket.on('error', this._onError.bind(this));
        this.socket.on('listening', this._onListening.bind(this));
        this.socket.on('message', this._onMessage.bind(this));

        log.info(`Created new headtracking unit #${this.remote.id}`);
    }

    _onClose()
    {
        this._setState(HTRKDevState.DISCONNECTED);
        log.info(`Socket closed for device #${this.remote.id}`);
    }

    _onError(e: Error)
    {
        this._setState(HTRKDevState.DISCONNECTED);
        log.error(e);
    }

    _onListening()
    {
        if (this._state(HTRKDevState.CONNECTING)) {

            log.info(`Listening for headtracking unit #${
                this.remote.id} on port ${this.remote.port}`);

            this.response_timeout
                = setTimeout(this._onResponseTimeout.bind(this), 2000);

            this._setState(HTRKDevState.INITIALIZING);
            this._sendDataDumpRequest();
        }
    }

    _onMessage(m: Buffer)
    {
        // this is a regular status update
        if (HeadtrackerConfigPacket.check(m)) {

            clearTimeout(this.response_timeout);

            let p = HeadtrackerConfigPacket.fromBuffer(m);

            if (this.resetting_orientation) {
                if (!p.isStateFlagSet(
                        HeadtrackerStateFlags.RESET_ORIENTATION)) {
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

            if (p.isDeviceFlagSet(HeadtrackerConfigFlags.UPDATE)) {

                log.info('Configuration saved to headtracking unit');

                this.local.conf  = p;
                this.remote.conf = p;
                this.local.conf.clearDeviceFlag(HeadtrackerConfigFlags.UPDATE);

                /**
                 * The current configuration was saved to the device
                 * @event Headtracker#saved
                 */
                this.server.emit('htrk.saved', this.remote.conf.deviceID());
                this._updateRemote();

                return this._updateDeviceNow();
            }

            if (p.isDeviceFlagSet(HeadtrackerConfigFlags.NON_REQUEST))
                return this._handleStateUpdate(p, false);

            if (this._state(HTRKDevState.INITIALIZING)) {

                this.remote.conf = p;
                this.local.conf  = p;
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

    _onResponseTimeout()
    {
        if (this._state() != HTRKDevState.TIMEOUT) {

            log.info('Headtracking unit timed out');

            this._setState(HTRKDevState.TIMEOUT);
            this.server.emit(
                'htrk.disconnected',
                (this.remote.conf) ? this.remote.conf.deviceID() : 'unknown');
            this._updateRemote();
        }

        this.response_timeout
            = setTimeout(this._onResponseTimeout.bind(this), 2000);

        this._sendDataDumpRequest();
    }

    _connect()
    {
        if (this._state(HTRKDevState.CONNECTED)) return;

        log.info(`Binding socket to ${this.local.netif}:${this.local.port}`);

        this._setState(HTRKDevState.CONNECTING);

        this.socket.bind(this.local.port, this.local.netif);
    }

    _disconnect()
    {
        this._setState(HTRKDevState.DISCONNECTED);

        if (this.socket) this.socket.close();
    }

    _handleStateUpdate(m: HeadtrackerConfigPacket, is_req: boolean)
    {
        if (!is_req) {

            if (m.device_state != this.remote.conf.device_state) {

                let msg = {
                    id : this.remote.conf.deviceID(),
                    prs : m.isStateFlagSet(HeadtrackerStateFlags.GY_PRESENT),
                    rdy : m.isStateFlagSet(HeadtrackerStateFlags.GY_RDY)
                };

                this.server.emit('htrk.gyro.changed', msg);
            }
        }

        this.remote.conf = m;

        log.silly(`Handling ${is_req ? 'requested ' : ''}state update`);

        if (!this.update_required) this.local.conf = m;

        if (!is_req) this._updateRemote();
    }

    _askStillAlive()
    {
        clearTimeout(this.response_timeout);

        this.response_timeout
            = setTimeout(this._onResponseTimeout.bind(this), 2000);

        this._setState(HTRKDevState.BUSY);
        this._sendDataDumpRequest();
    }

    _askAliveLater()
    {
        clearTimeout(this.check_alive_timeout);

        this.check_alive_timeout
            = setTimeout(this._askStillAlive.bind(this), 5000);
    }

    _updateDevice()
    {
        if (!this._state(HTRKDevState.CONNECTED))
            return (this.update_required = true);

        this._updateDeviceNow();

        this.update_required = false;
    }

    _updateDeviceNow()
    {
        clearTimeout(this.response_timeout);

        this.response_timeout
            = setTimeout(this._onResponseTimeout.bind(this), 2000);

        this._sendConfig(this.local.conf);
    }

    _sendConfig(m: HeadtrackerConfigPacket)
    {
        this.dumping = false;

        this._send(m);
    }

    _sendDataDumpRequest()
    {
        this.dumping = true;

        this._send(new HeadtrackerConfigPacket().setDeviceFlag(
            HeadtrackerConfigFlags.DUMP_DATA));
    }

    _send(p: HeadtrackerConfigPacket)
    {
        if (this.socket)
            this.socket.send(p.toBuffer(), this.remote.port, this.remote.addr);
    }

    _state(s?: HTRKDevState): HTRKDevState|boolean
    {
        if (s != undefined)
            return s == this.remote.state;
        else
            return this.remote.state;
    }

    _setState(s: HTRKDevState)
    {
        this.remote.state = s;
    }

    _updateRemote()
    {
        this.emit('update');
    }

    // user functions

    setID(id: number)
    {
        this.local.conf.setDeviceID(id);
        this._updateDevice();
    }

    setSamplerate(rate: number)
    {
        this.local.conf.sample_rate = rate;
        this._updateDevice();
    }

    setStreamDest(ip: string, port: number)
    {
        log.info(`Setting headtracker ${
            this.remote.conf.deviceID()} stream destination address to ${ip}:${
            port}`);
        this.local.conf.stream_dest_addr = ip;
        this.local.conf.stream_dest_port = port;
        this._updateDevice();
    }

    setInvertation(invertation: HeadtrackerInvertation)
    {
        if (invertation.x)
            this.local.conf.setStateFlag(HeadtrackerStateFlags.INVERT_X);
        else
            this.local.conf.clearStateFlag(HeadtrackerStateFlags.INVERT_X);

        if (invertation.y)
            this.local.conf.setStateFlag(HeadtrackerStateFlags.INVERT_Y);
        else
            this.local.conf.clearStateFlag(HeadtrackerStateFlags.INVERT_Y);

        if (invertation.z)
            this.local.conf.setStateFlag(HeadtrackerStateFlags.INVERT_Z);
        else
            this.local.conf.clearStateFlag(HeadtrackerStateFlags.INVERT_Z);

        console.log(this.local.conf.device_state);

        this._updateDevice();
    }

    resetOrientation()
    {
        this.local.conf.setStateFlag(HeadtrackerStateFlags.RESET_ORIENTATION);
        this.resetting_orientation = true;
        this._updateDevice();
    }

    applyNetworkSettings(settings: HeadtrackerNetworkSettings)
    {
        if (settings.id) this.local.conf.setDeviceID(settings.id);

        if (settings.addr) this.local.conf.device_static_ip = settings.addr;

        if (settings.subnet)
            this.local.conf.device_static_subnet = settings.subnet;

        if (settings.dhcp != undefined) {

            if (settings.dhcp)
                this.local.conf.setNetworkFlag(HeadtrackerNetworkFlags.DHCP);
            else
                this.local.conf.clearNetworkFlag(HeadtrackerNetworkFlags.DHCP);
        }

        this.local.conf.setDeviceFlag(HeadtrackerConfigFlags.UPDATE);
        this._updateDevice();
    }

    save()
    {
        this.local.conf.setDeviceFlag(HeadtrackerConfigFlags.UPDATE);
        this._updateDevice();
    }

    reboot()
    {
        this.local.conf.setDeviceFlag(HeadtrackerConfigFlags.REBOOT);
        this._updateDevice();
    }

    enableTx()
    {
        this.local.conf.setDeviceFlag(HeadtrackerConfigFlags.STREAM_ENABLED);

        log.info(`Enabling data transmission on headtracking unit #${
            this.remote.id}`);

        this._updateDevice();
    }

    disableTx()
    {
        this.local.conf.clearDeviceFlag(HeadtrackerConfigFlags.STREAM_ENABLED);

        log.info(`Disabling data transmission on headtracking unit #${
            this.remote.id}`);

        this._updateDevice();
    }

    destroy()
    {
        this.socket.close();
        clearTimeout(this.response_timeout);
        clearTimeout(this.check_alive_timeout);
    }

    start()
    {
        this._connect();
    }
}

export class Headtracking extends EventEmitter {

    local_interface: string;

    browser: dnssd.Browser;
    trackers: Headtracker[] = [];

    server: SocketIO.Server;

    constructor(port: number, interf: SocketIO.Server, netif?: string)
    {
        super();

        this.local_interface = netif;
        this.server          = interf;

        this.browser = new dnssd.Browser(dnssd.udp('_htrk'), {
            interface : netif,
        });

        this.browser.on('serviceUp', this.serviceFound.bind(this));
        this.browser.on('serviceDown', this.serviceRemoved.bind(this));

        this.browser.start();

        let self = this;

        this.server.on('connection', socket => {
            socket.on('htrk.update.req', () => {
                self.updateRemote(socket);
            })

            socket.on('htrk.sr.changed', (id: number, sr: number) => {
                console.log('sr changed')
                self.getHeadtracker(id).setSamplerate(sr);
            })

            socket.on('htrk.stream.changed', (id: number, on: boolean) => {
                if (on)
                    self.getHeadtracker(id).enableTx();
                else
                    self.getHeadtracker(id).disableTx();
            });

            socket.on('htrk.reboot', (id: number) => {
                self.getHeadtracker(id).reboot();
            });

            socket.on('htrk.save', (id: number) => {
                self.getHeadtracker(id).save();
            });

            socket.on('htrk.invert.changed',
                      (id: number, inv: HeadtrackerInvertation) => {
                          log.info('Invertation changed on headtracker ' + id)
                          self.getHeadtracker(id).setInvertation(inv) });

                          socket.on('htrk.save.settings',
                                    (settings: HeadtrackerNetworkSettings) => {
                                        self.getHeadtracker(settings.id)
                                            .applyNetworkSettings(settings);
                                    });

                          socket.on('htrk.reset.orientation',
                                    (id: number) => self.getHeadtracker(id)
                                                        .resetOrientation());
        });
    }

    serviceFound(service: dnssd.Service)
    {
        log.info('Found new headtracking service on ' + service.addresses[0]);

        let id = Number.parseInt(service.host.substr(8, 2));

        let htrk = new Headtracker(this.server,
                                   id,
                                   service.addresses[0],
                                   11023,
                                   0,
                                   this.local_interface);
        htrk.start();

        htrk.on('update', this.updateRemote.bind(this));

        let dup = this.trackers.find(trk => trk.remote.id == id)

        if (dup)
        {
            dup.destroy();
            this.trackers.splice(this.trackers.indexOf(dup), 1);
        }

        this.trackers.push(htrk);

        this.server.emit('htrk.connected', id, service.addresses[0])
    }

    serviceRemoved(service: dnssd.Service) {}

    getHeadtracker(id: number)
    {
        return this.trackers.filter(tr => tr.remote.conf.deviceID() == id)[0];
    }

    updateRemote(socket?: SocketIO.Socket)
    {
        // clang-format off
        let tracker_update = this.trackers
            .map((tracker: Headtracker) => {
                if (tracker.remote.conf) 
                return {
                        data: {
                            address:        tracker.remote.addr,
                            gyro_online:    tracker.remote.conf.isStateFlagSet(HeadtrackerStateFlags.GY_PRESENT),
                            gyro_ready:     tracker.remote.conf.isStateFlagSet(HeadtrackerStateFlags.GY_RDY),
                            online:         tracker._state(HTRKDevState.CONNECTED) || tracker._state(HTRKDevState.BUSY),
                            samplerate:     tracker.remote.conf.sample_rate,
                            stream_on:      tracker.remote.conf.isDeviceFlagSet(HeadtrackerConfigFlags.STREAM_ENABLED),
                            id:             tracker.remote.conf.deviceID(),

                            settings: {
                                id: tracker.remote.conf.deviceID(),
                                addr: tracker.remote.conf.device_static_ip,
                                subnet: tracker.remote.conf.device_static_subnet,
                                dhcp: tracker.remote.conf.isNetworkFlagSet(HeadtrackerNetworkFlags.DHCP)
                            },

                            invert: {
                                x: tracker.remote.conf.isStateFlagSet(HeadtrackerStateFlags.INVERT_X),
                                y: tracker.remote.conf.isStateFlagSet(HeadtrackerStateFlags.INVERT_Y),
                                z: tracker.remote.conf.isStateFlagSet(HeadtrackerStateFlags.INVERT_Z)
                            }
                            
                        }
                    }
                else
                    return null;
            })
            .filter(v => v != null);
        // clang-format on

        if (socket)
            socket.emit('htrk.update', tracker_update);
        else
            this.server.emit('htrk.update', tracker_update);
    }
}
