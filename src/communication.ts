import * as net from 'net';
import * as IPC from './ipc';
import * as SocketIO from 'socket.io';
import * as SocketIOClient from 'socket.io-client';
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

class SINodeWSConnection {
    socket: SocketIO.Socket;
}   

class SIServerWSAdapter extends EventEmitter {

    nodes: SINodeWSConnection[]
    wsserver: SocketIO.Server;

    constructor(config: any) {
        super();
        this.wsserver = SocketIO.listen(config.server_port)
    }
}

class SINodeWSAdapter extends EventEmitter {

    wsclient: SocketIOClient.Socket;

    constructor() {
        super();
        this.wsclient = SocketIOClient.connect("");
    }
}