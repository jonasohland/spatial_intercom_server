import {createSocket as createDgramSocket, Socket} from 'dgram';
import EventEmitter from 'events';

import * as Logger from './log';

const log = Logger.get('HTK');

import {
    Headtracker,
    HeadtrackerInvertation,
    HeadtrackerConfigFlags,
    HeadtrackerNetworkFlags,
    HeadtrackerNetworkSettings,
    HeadtrackerStateFlags,
    HeadtrackerConfigPacket
} from './headtracker'
import WebInterface from './web_interface';


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

export class NetworkHeadtracker extends Headtracker {

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
    webif: WebInterface;

    constructor(server: WebInterface, id: number, addr: string, port: number,
                netif?: string)
    {
        super();

        this._setState(HTRKDevState.DISCONNECTED);

        this.remote.addr = addr;
        this.remote.port = port;
        this.remote.id   = id;

        this.dumping = false;

        this.local.netif = netif;

        this.socket = createDgramSocket('udp4');
        this.webif  = server;

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
        this.local.port  = this.socket.address().port;
        this.local.netif = this.socket.address().address;

        if (this._state(HTRKDevState.CONNECTING)) {

            log.info(`Listening for headtracking unit #${
                this.remote.id} at port ${this.remote.port}`);

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

                this.webif.io.emit('htrk.reconnected', p.deviceID());
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
                this.webif.io.emit('htrk.saved', this.remote.conf.deviceID());
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
            this.webif.io.emit(
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
        if (this._state(HTRKDevState.CONNECTED))
            return;

        this._setState(HTRKDevState.CONNECTING);

        this.socket.bind();
    }

    _disconnect()
    {
        this._setState(HTRKDevState.DISCONNECTED);

        if (this.socket)
            this.socket.close();
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

                this.webif.io.emit('htrk.gyro.changed', msg);
            }
        }

        this.remote.conf = m;

        log.silly(`Handling ${is_req ? 'requested ' : ''}state update`);

        if (!this.update_required)
            this.local.conf = m;

        if (!is_req)
            this._updateRemote();
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

    calibrate(): Promise<void>
    {
        log.warn('Calibrate-stub called');
        return new Promise((res) => {
            res();
        });
    }

    beginInit(): Promise<void>
    {
        return undefined;
    }

    finishInit(): Promise<void>
    {
        return undefined;
    }

    applyNetworkSettings(settings: HeadtrackerNetworkSettings)
    {
        if (settings.id)
            this.local.conf.setDeviceID(settings.id);

        if (settings.addr)
            this.local.conf.device_static_ip = settings.addr;

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

    isOnline()
    {
        return <boolean>this._state(HTRKDevState.CONNECTED
                                    || HTRKDevState.BUSY);
    }

    start()
    {
        this._connect();
    }
}