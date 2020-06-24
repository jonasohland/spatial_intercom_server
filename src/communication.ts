import {createHash} from 'crypto';
import * as mdns from 'dnssd';
import {EventEmitter} from 'events';
import * as http from 'http';
import {machineIdSync} from 'node-machine-id';
import SocketIO from 'socket.io';
import SocketIOClient from 'socket.io-client';

import {getServerAdvertiser, getServerBrowser} from './discovery';
import {_log_msg, Connection, IPCServer, Message, MessageMode} from './ipc';
import * as Logger from './log';
import {defaultIF} from './util';


const log = Logger.get('WSCOMM');

/**
 * Create a unique identifier for this node user-chosen name.
 * This Identifier is unique for for every machine.
 * @param name name of this node
 */
function unique_node_id(name: string)
{
    let idstring = machineIdSync();
    return createHash('sha1').update(`${idstring}-${name}`).digest('base64');
}

export interface NodeIdentification {
    id: string, name: string
}

enum SISessionState {
    OFFLINE,
    CONNECT_NODE,
    ONLINE,
    RECONNECTING
}

enum SIClientState {
    OFFLINE,
    CONNECTING,
    WAIT_SERVER,
    ONLINE,
    RECONNECTING
}

const SIClientEvents = {
    EXCHANGE_IDS : '__exchange_id',
    DSP_ONLINE : '__dsp_online',
};

const SISessionEvents = {
    ACK : '__ack',
}

export abstract class NodeMessageInterceptor extends EventEmitter {
    abstract target(): string;
    abstract async handleMessage(msg: Message, from_ipc: boolean): Promise<any>;

    event(name: string, payload?: any)
    {
        this.emit('__event', name, payload);
    }
}

/**
 * Represents a connection to a server in the Node
 */
export class SINodeWSClient {
    private _state: SIClientState = SIClientState.OFFLINE;
    private _browser: mdns.Browser;
    private _sock: SocketIOClient.Socket;
    private _new_socks: SocketIOClient.Socket[] = [];
    private _id: NodeIdentification;
    private _ws_interceptors: Record<string, NodeMessageInterceptor>  = {};
    private _ipc_interceptors: Record<string, NodeMessageInterceptor> = {};
    private _ipc: IPCServer;

    constructor(config: any, ipc: IPCServer)
    {
        this._ipc = ipc;

        this._ipc.on('data', this._on_ipc_msg.bind(this));

        this._id = {
            name : config.node_name,
            id : unique_node_id(config.node_name)
        };

        log.info(`Browsing for si-servers on ${defaultIF(config.interface)}`);

        this._browser = getServerBrowser(config.interface);
        this._browser.on('serviceUp', this._on_service_discovered.bind(this));
        this._browser.start();
    }

    _on_service_discovered(service: mdns.Service)
    {
        log.info('Discovered new \'si-server\' service with:');

        for (let addr of service.addresses)
            log.info('  addr: ' + addr);

        log.info('and port ' + service.port);
        log.info('Full name: ' + service.fullname);

        switch (this._state) {
            case SIClientState.OFFLINE: return this._service_connect(service);
            case SIClientState.RECONNECTING:
                return this._service_reconnect(service);
            default:
                log.warn(
                    'Already connected or currently establishing a connection. Ignoring this service');
        }
    }

    _service_connect(service: mdns.Service)
    {
        log.info('Try connecting to: ');

        for (let addr of service.addresses) {

            let uri = `ws://${addr}:${service.port}`;
            log.info('    ' + uri);

            let newsock = SocketIOClient(uri);
            newsock.on('connect', this._on_socket_connect.bind(this, newsock));
            newsock.on('close', this._on_temp_socket_close.bind(this, newsock));

            this._new_socks.push(newsock);
        }

        this._state = SIClientState.CONNECTING
    }

    _service_reconnect(service: mdns.Service)
    {
        if (this._sock)
            this._sock.close();

        this._sock  = null;
        this._state = SIClientState.CONNECTING;
        this._service_connect(service);
    }

    _on_socket_connect(socket: SocketIOClient.Socket)
    {
        log.info('Socket connected');

        if (this._state == SIClientState.CONNECTING) {
            this._sock
                = this._new_socks.splice(this._new_socks.indexOf(socket), 1)[0];

            this._sock.on('disconnect', this._on_socket_close.bind(this));

            this._sock.on('msg', this._on_msg.bind(this));

            this._sock.emit(SIClientEvents.EXCHANGE_IDS, this._id);
            this._state = SIClientState.WAIT_SERVER;

            this._sock.on(SISessionEvents.ACK, this._on_ack.bind(this));
        }
        else if (this._state == SIClientState.RECONNECTING) {
            this._sock.emit(SIClientEvents.EXCHANGE_IDS, this._id);
            this._state = SIClientState.WAIT_SERVER;
        }
        else {
            while (this._new_socks.length)
                this._new_socks.shift().close();
        }
    }

    _on_ack()
    {
        log.info('Received ACK from server. We are online!');
        this._state = SIClientState.ONLINE;
    }

    _on_socket_close(reason: string)
    {
        log.info('Connection lost. Reason: ' + reason);

        this._state = SIClientState.RECONNECTING;

        if (reason === 'io server disconnect')
            this._sock.connect();
    }

    _on_temp_socket_close(socket: SocketIOClient.Socket, reason: string)
    {
        let idx = this._new_socks.findIndex(s => s === socket);
        if (idx != -1) {
            log.info(`Remove temp connection ${reason}`);
            this._new_socks.splice(idx, 1);
        }
    }

    _on_msg(msg: string)
    {
        this._on_msg_impl(msg, true);
    }

    _on_ipc_msg(msg: string)
    {
        this._on_msg_impl(msg, false);
    }

    _ws_return_error(original_message: Message, err: string)
    {
        let newmsg = Message.Rsp(original_message.target, original_message.field);
        newmsg.data = '__ERROR__';
        newmsg.err = err;

        this._sock.emit('msg', newmsg.toString());
    }

    _on_msg_impl(msg: string, to_ipc: boolean)
    {
        try {
            let m = Message.parse(msg);
            let intc;

            if (to_ipc)
                intc = this._ws_interceptors[m.target];
            else
                intc = this._ipc_interceptors[m.target];

            _log_msg(m, to_ipc, intc == null);

            if (intc)
                intc.handleMessage(m, !to_ipc)
                    .then(this._intc_handle_return.bind(this, m, to_ipc))
                    .catch(this._intc_handle_return_error.bind(this, m, to_ipc));
            else {
                if (to_ipc){
                    if (!this._ipc.send(msg))
                        this._ws_return_error(m, "DSP process offline");
                }
                else
                    this._sock.emit('msg', msg);
            }
        }
        catch (err) {
            log.error("Something went wrong while delivering message: " + err);
            // not shure what to do here...
        }
    }


    _intc_handle_return(msg: Message, to_ipc: boolean, data: any)
    {
        msg.mode = MessageMode.RSP;
        msg.data = data;

        _log_msg(msg, false, false);

        if(to_ipc)
            this._sock.emit('msg', msg.toString());
        else
            this._ipc.send(msg.toString());
    }

    _intc_handle_return_error(msg: Message, to_ipc: boolean, data: any)
    {
        let newmsg = Message.Rsp(msg.target, msg.field);
        log.info("returning error")
        newmsg.err = data;
        newmsg.data = "__ERROR__";

        _log_msg(newmsg, false, false);

        if(to_ipc)
            this._sock.emit('msg', newmsg.toString());
        else
            this._ipc.send(newmsg.toString());
    }

    _intc_emit_event(intc: NodeMessageInterceptor, name: string, payload: any)
    {
        if(this._sock) {
            let msg = Message.Event(intc.target(), name);
            msg.data = payload;
            _log_msg(msg, false, false);
            this._sock.emit('msg', msg.toString());
        }
    }

    addIPCInterceptor(intc: NodeMessageInterceptor)
    {
        this._ipc_interceptors[intc.target()] = intc;
    }

    addWSInterceptor(intc: NodeMessageInterceptor)
    {
        this._ws_interceptors[intc.target()] = intc;
        intc.on('__event', this._intc_emit_event.bind(this, intc));
    }
}


/**
 * Represents the connection to a node in the SI server
 */
export class SIServerWSSession extends Connection {

    begin(): void
    {
        throw new Error('Method not implemented.');
    }

    send(msg: Message): void
    {
        log.info('Send message to ' + msg.target);

        if (this._sock) {
            this._sock.emit('msg', msg.toString());
        }
    }

    isLocal(): boolean
    {
        return false;
    }

    private _state: SISessionState = SISessionState.OFFLINE;
    private _sock: SocketIO.Socket;
    private _id: NodeIdentification;
    private _server: SIServerWSServer;

    constructor(socket: SocketIO.Socket, server: SIServerWSServer)
    {
        super();
        this._sock   = socket;
        this._server = server;

        this._sock.on(
            SIClientEvents.EXCHANGE_IDS, this._on_exchange_ids.bind(this));

        this._sock.on('msg', this._on_msg.bind(this));
        this._sock.on('disconnect', this._on_disconnect.bind(this));

        this._state = SISessionState.CONNECT_NODE;
    }

    _on_exchange_ids(id: NodeIdentification)
    {
        if (this._state == SISessionState.CONNECT_NODE) {
            log.info('Got EXCHANGE_IDS message from ' + id.name);
            this._id    = id;
            this._state = SISessionState.ONLINE;
            this._sock.emit(SISessionEvents.ACK);
            this.emit('online');
            log.info('Sent ACK message to node. Node is online!');
        }
        else {
            log.error('Unexpected exchange_ids message, trashing connection');
            this.destroy();
        }
    }

    _on_disconnect()
    {
        this.emit('offline');
        this._server._on_disconnect(this);
    }

    _on_msg(msg: string)
    {
        try {
            let m = Message.parse(msg);
            this.emit(m.target, m);
        }
        catch (err) {
            log.error('Could not parse message: ' + err);
        }
    }

    id()
    {
        return this._id;
    }

    destroy()
    {
        this._sock.disconnect();
        this._server._on_disconnect(this);
    }
}

/**
 * Communications server class
 */
export class SIServerWSServer extends EventEmitter {

    private _io: SocketIO.Server;
    private _http: http.Server;
    private _mdns_advertiser: mdns.Advertisement;

    private _new_sessions: SIServerWSSession[] = [];
    private _sessions: SIServerWSSession[]     = [];

    /**
     * construct a new WebSocket server to communicate with SI DSP Nodes
     * @param options options, merged from config file and command line options
     */
    constructor(config: any)
    {
        super();
        this._http = http.createServer();
        this._io   = SocketIO.listen(this._http);

        this._io.on('connection', this._on_connection.bind(this));

        this._mdns_advertiser
            = getServerAdvertiser(config.server_port, config.interface);

        this._http.listen(config.server_port, config.interface);

        this._http.on('listening', () => {
            log.info(`Listening on ${defaultIF(config.interface)}:${
                config.server_port}`);
        });

        this._mdns_advertiser.start();
        log.info('Added mdns advertisement for this server');
    }

    private _on_connection(socket: SocketIO.Socket)
    {
        let session = new SIServerWSSession(socket, this);
        this._new_sessions.push(session);
        this.emit('new-connection', session);
    }

    _on_disconnect(session: SIServerWSSession)
    {
        let idx = this._sessions.findIndex(s => s === session);

        if (idx != -1) {
            log.info('Removing connection for ' + session.id().name);
            this.emit('close-connection', session)
        }
    }

    addFromNewSessions(session: SIServerWSSession)
    {
        if (this._sessions.includes(session)) {
            log.info(`Session for ${
                session.id()
                    .name} already exists and is online. Dropping connection.`);
            session.destroy();
        }
        else {
            log.info(`Established connection with ${session.id().name}`);

            let idx = this._new_sessions.findIndex(s => s.id().id
                                                        == session.id().id);

            if (idx != -1)
                this._new_sessions.splice(idx, 1);
            else
                log.warn(
                    'Could not find session in preparation stage. Something is wrong here');

            this._sessions.push(session);
        }
    }

    destruct()
    {
        return this._mdns_advertiser.stop();
    }
}