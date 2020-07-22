import dgram, {RemoteInfo} from 'dgram';
import * as dnssd from 'dnssd';
import {EventEmitter} from 'events';
import express from 'express';
import {AddressInfo} from 'net';
import SerialPort from 'serialport';

import {
    HeadtrackerConfigFlags,
    HeadtrackerConfigPacket,
    HeadtrackerDataPacket,
    HeadtrackerStateFlags,
} from './headtracker';

import {} from './headtracker_network'
import {
    LocalHeadtracker,
    QuaternionContainer,
    UDPOutputAdapter
} from './headtracker_serial';

import * as Logger from './log';
import * as util from './util';

const log = Logger.get('BRIDGE');

class SIOutputAdapter extends UDPOutputAdapter {

    id: number = 0;
    _seq: number = 0;

    seq()
    {
        if(++this._seq > 65535)
            this._seq = 0;
            
        return this._seq;
    }

    process(q: QuaternionContainer): void
    {
        let { buffer, offset } = q.data();

        if (q.float())
            this.sendData(HeadtrackerDataPacket.newPacketFromFloatLEData(
                buffer, offset, this.id, this.seq()));
        else
            this.sendData(HeadtrackerDataPacket.newPackerFromInt16Data(
                buffer, offset, this.id, this.seq()));
    }
}

export class HeadtrackerBridgeDevice extends EventEmitter {

    private lhtrk: LocalHeadtracker;
    private output: SIOutputAdapter;

    path: string;

    _adv: dnssd.Advertisement;
    _sock: dgram.Socket;

    conf: HeadtrackerConfigPacket;
    remote: AddressInfo;

    constructor(port: SerialPort)
    {
        super();

        port.open();

        this.path   = port.path;
        this.output = new SIOutputAdapter();
        this.lhtrk  = new LocalHeadtracker(port, this.output);

        this._sock = dgram.createSocket('udp4');
        this.conf  = new HeadtrackerConfigPacket();

        this._sock.bind(this.onPortBound.bind(this));
        this._sock.on('message', this.onMessage.bind(this));

        this.lhtrk.on('close', (err) => {
            this.emit('close');
        });

        this.output.setRemote('127.0.0.1', 9999);
    }

    onPortBound()
    {
        if (!this.lhtrk.isOnline()) {
            this.lhtrk.on('ready', () => {
                this.registerService();
            })
        }
        else
            this.registerService();
    }

    registerService()
    {
        this.conf.setDeviceID(this.lhtrk.shtrk._id);

        if (util.LocalInterfaces.length < 1) {
            log.error(
                'Could not find a suitable network interface on this machine');
            this.emit('close');
            return;
        }

        this.conf.device_static_subnet = util.LocalInterfaces[0].netmask;
        this.conf.device_static_ip     = util.LocalInterfaces[0].address;

        console.log(this.conf);

        let sname = `si_htrk_${
            (this.lhtrk.shtrk._id < 10) ? '0' + this.lhtrk.shtrk._id
                                        : this.lhtrk.shtrk._id}`;

        log.info('Headtracker ready. Adding new mdns advertisement: _htrk._udp.'
                 + sname);

        this._adv = new dnssd.Advertisement(dnssd.udp('_htrk'),
                                            this._sock.address().port,
                                            { host : sname, name : sname });

        this._adv.start();
    }

    onMessage(msg: Buffer, addrinfo: AddressInfo)
    {

        if (HeadtrackerConfigPacket.check(msg)) {
            this.remote = addrinfo;
            let pkt     = HeadtrackerConfigPacket.fromBuffer(msg);

            if (pkt.isDeviceFlagSet(HeadtrackerConfigFlags.DUMP_DATA))
                return this.dumpData();

            this.applyDiffConfig(pkt);
        }
    }

    dumpData()
    {
        this._sock.send(
            this.conf.toBuffer(), this.remote.port, this.remote.address);
    }

    saveConfiguration() {}

    async applyDiffConfig(conf: HeadtrackerConfigPacket)
    {
        if (conf.sample_rate != this.conf.sample_rate) {
            this.conf.sample_rate = conf.sample_rate;
            this.lhtrk.setSamplerate(this.conf.sample_rate);
        }

        if (conf.isDeviceFlagSet(HeadtrackerConfigFlags.STREAM_ENABLED)
            != this.conf.isDeviceFlagSet(
                HeadtrackerConfigFlags.STREAM_ENABLED)) {

            if (conf.isDeviceFlagSet(HeadtrackerConfigFlags.STREAM_ENABLED)) {
                log.info('Enable data transmission for headtracker '
                         + this.conf.deviceID());
                this.output.id = this.conf.deviceID();
                this.lhtrk.enableTx();
                this.conf.setDeviceFlag(HeadtrackerConfigFlags.STREAM_ENABLED);
            }
            else {
                log.info('Disable data transmission for headtracker '
                         + this.conf.deviceID());
                await this.lhtrk.disableTx();
                this.conf.clearDeviceFlag(
                    HeadtrackerConfigFlags.STREAM_ENABLED);
            }
        }

        if (conf.isDeviceFlagSet(HeadtrackerConfigFlags.REBOOT)) {
            await this.lhtrk.reboot();
        }

        if (conf.isDeviceFlagSet(HeadtrackerConfigFlags.UPDATE)) {
            this.saveConfiguration();
        }

        if (this.conf.stream_dest_addr != conf.stream_dest_addr) {
            this.conf.stream_dest_addr = conf.stream_dest_addr;
            this.output.setRemote(
                this.conf.stream_dest_addr, this.conf.stream_dest_port)
        }

        if (this.conf.stream_dest_port != conf.stream_dest_port) {
            this.conf.stream_dest_port = conf.stream_dest_port;
            this.output.setRemote(
                this.conf.stream_dest_addr, this.conf.stream_dest_port)
        }

        if (conf.isStateFlagSet(HeadtrackerStateFlags.RESET_ORIENTATION)) {
            this.conf.clearStateFlag(HeadtrackerStateFlags.RESET_ORIENTATION);
            this.lhtrk.resetOrientation();
        }

        let inv_bits = HeadtrackerStateFlags.INVERT_X
                       | HeadtrackerStateFlags.INVERT_Y
                       | HeadtrackerStateFlags.INVERT_Z;

        if ((conf.device_state & inv_bits)
            != (this.conf.device_state & inv_bits)) {

            this.conf.device_state = (this.conf.device_state & ~inv_bits)
                                     | (conf.device_state & inv_bits);

            let inv = {
                x : this.conf.isStateFlagSet(HeadtrackerStateFlags.INVERT_X),
                y : this.conf.isStateFlagSet(HeadtrackerStateFlags.INVERT_Y),
                z : this.conf.isStateFlagSet(HeadtrackerStateFlags.INVERT_Z)
            };

            log.info("Invertation changed: ");
            console.log(inv);

            this.lhtrk.setInvertation(inv);
        }

        this.dumpData();
    }

    async reconnect(port: SerialPort)
    {
        await this.lhtrk.destroy();
        this.lhtrk = new LocalHeadtracker(port, this.output);
    }

    destroy()
    {
        this._sock.close();

        if (this._adv)
            this._adv.stop(false, () => {
                log.info('Advertisement for ' + this.path + ' removed');
            });

        this.lhtrk.destroy().catch((err) => {
            log.warn('Could not close port: ' + err);
        });
    }
}

export class HeadtrackerBridge {

    _devs: HeadtrackerBridgeDevice[] = [];
    _remote: RemoteInfo;
    _app: express.Application;

    constructor()
    {
        this._app = express();
        this._app.get('headtracker')
    }

    findDeviceForPath(p: string)
    {
        return this._devs.find(d => d.path === p);
    }

    addDevice(p: string)
    {
        log.info('Opening port ' + p);
        let odev = this.findDeviceForPath(p);

        if (odev)
            return log.error(
                'Device ' + p
                + ' already opened. Not trying to open again. That would be pointless.');

        let newdev = new HeadtrackerBridgeDevice(
            new SerialPort(p, { baudRate : 115200, autoOpen : false }));

        this._devs.push(newdev);
        newdev.on('close', this.removeDevice.bind(this, p));
    }

    removeDevice(p: string)
    {
        let dev = this.findDeviceForPath(p);

        if (!dev) return;

        dev.destroy();

        log.info('Closing port and deregistering device at ' + p);

        this._devs.splice(this._devs.indexOf(dev), 1);
    }
}