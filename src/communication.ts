import * as net from 'net';
import * as IPC from './ipc';
import 'socket.io';
import 'socket.io-client';
import * as mdns from 'dnssd';
import { EventEmitter } from 'events';

import * as Logger from './log';

const log = Logger.get('COM');

enum SIClientState {
    DISCONNECTED,
    IDENT_EXCHANGE,
    WAITING,
    CONNECTED,
    RECONNECTING
};

class SIServerWSClient extends EventEmitter {

    wsclient_sock: SocketIO.Socket;
    state: SIClientState;
    id: string;
    name: string;

    constructor(socket: SocketIO.Client) {

        super();

        this.state = SIClientState.IDENT_EXCHANGE;

        this.wsclient_sock.on('ident_exchange', this.identExchangeHandler.bind(this));
        this.wsclient_sock.on('dsp_attach', this.dspAttachHandler.bind(this));
        this.wsclient_sock.on('dsp_detach', this.dspDetachHandler.bind(this));

        this.wsclient_sock.on('msg', this.msgHandler.bind(this));

        log.info("New Node connected, exchanging Identities");

        this.wsclient_sock.emit("ident_exchange");
    }

    clientDisconnectHandler() {
        log.warn("Client " + this.name + " disconnected");
        this.state = SIClientState.RECONNECTING;
    }

    identExchangeHandler(id: string, name: string) {

        this.name = name;
        this.id = id;

        log.info("Exchanged identities with " + name + ", ID: " + id);
        log.info("Waiting for dsp_attach");

        this.state = SIClientState.WAITING;

        this.wsclient_sock.emit('ready');
    }

    dspAttachHandler() {
        this.state = SIClientState.CONNECTED;
        log.info("DSP attached on Node " + this.name);
        this.emit("dsp_attached");
    }

    dspDetachHandler() {
        this.state = SIClientState.WAITING;
        log.warn("DSP detached on Node " + this.name);
        this.emit("dsp_detached");
    }

    msgHandler(msg: string) {
        
    }
}

class SIServerWSServer extends EventEmitter {

    wsserv: SocketIO.Server; 
    advert: mdns.Advertisement;

    waiting_clients: SIServerWSClient[];
    clients: SIServerWSClient[];

    constructor(srv: SocketIO.Server) {

        super();

        this.wsserv.on('connection', () => {
            
        });
    }

};

class SINodeWSClient {}

class SINodeWSServer {}