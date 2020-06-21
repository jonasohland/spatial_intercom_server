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

/**
 * Represents a connection to a server in the Node
 */
class SINodeWSClient {
    private _state: SIClientState = SIClientState.DISCONNECTED;
}


/**
 * Represents the connection to a node in the SI server
 */
class SIServerWSClient {
    private _state: SIClientState = SIClientState.DISCONNECTED;
}

/**
 * Communications server class
 */
class SIServerWSServer {

    constructor(options: any)
    {
        
    }


}