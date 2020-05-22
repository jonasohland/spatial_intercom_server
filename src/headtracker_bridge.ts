import SerialPort from 'serialport';

import {
    HeadtrackerConfigFlags,
    HeadtrackerConfigPacket,
    HeadtrackerDataPacket,
    HeadtrackerInvertation,
    HeadtrackerNetworkFlags,
    HeadtrackerNetworkSettings,
    HeadtrackerStateFlags,
    Quaternion
} from './headtracker';

import {} from './headtracker_network'

import {
    LocalHeadtracker,
    QuaternionContainer,
    UDPOutputAdapter
} from './headtracker_serial';

import {
    ShowfileManager
} from './showfiles'

import * as dnssd from 'dnssd';
import dgram, { RemoteInfo } from 'dgram';

class SIOutputAdapter extends UDPOutputAdapter {

    id: number = 0;

    process(q: QuaternionContainer): void
    {
        let { buffer, offset } = q.data();

        if (q.float())
            this.sendData(HeadtrackerDataPacket.newPacketFromFloatLEData(
                buffer, offset, this.id));
        else
            this.sendData(HeadtrackerDataPacket.newPackerFromInt16Data(
                buffer, offset, this.id));
    }
}

export class HeadtrackerBridgeDevice {

    private lhtrk: LocalHeadtracker;
    private output: SIOutputAdapter;

    constructor(port: SerialPort)
    {
        this.output = new SIOutputAdapter();
        this.lhtrk   = new LocalHeadtracker(port, this.output);
        this.output.setRemote("127.0.0.1", 9999);
    }

    async reconnect(port: SerialPort)
    {
        await this.lhtrk.destroy();
        this.lhtrk = new LocalHeadtracker(port, this.output);
    }

    close() {}
}

class HeadtrackerBridge
{
    _adv: dnssd.Advertisement;
    _sock: dgram.Socket;
    _config: HeadtrackerConfigPacket;
    _devs: HeadtrackerBridgeDevice[]; 

    _remote: RemoteInfo;

    constructor()
    {
        this._adv = new dnssd.Advertisement(dnssd.udp('_htrk'), 5697, {host: 'si_htrk_01'});
        this._adv.start();

        this._sock = dgram.createSocket('udp4');

        this._sock.bind(5697);

        this._sock.on('message', this._on_message.bind(this));
        this._sock.on('listening', this._on_listen.bind(this));
        this._sock.on('close', this._on_close.bind(this));
        this._sock.on('error', this._on_error.bind(this));
    }

    _on_listen() {
    }

    _on_message(msg: Buffer, rinfo: RemoteInfo) {
        if(!HeadtrackerConfigPacket.check(msg))
            return;

        this._remote = rinfo;
    }

    _on_close() {
    }

    _on_error(err: Error) {
    }
}