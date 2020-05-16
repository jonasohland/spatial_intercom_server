import * as dnssd from 'dnssd';
import dgram, { RemoteInfo } from 'dgram';
import { HeadtrackerConfigFlags, HeadtrackerNetworkFlags, HeadtrackerStateFlags, HeadtrackerConfigPacket } from './headtracker'
import * as util from './util';
import { ShowfileManager } from './showfiles';

class HeadtrackerBridge
{
    _adv: dnssd.Advertisement;
    _sock: dgram.Socket;
    _config: HeadtrackerConfigPacket;

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


export default function() 
{
    new HeadtrackerBridge();
    let man = new ShowfileManager();
}