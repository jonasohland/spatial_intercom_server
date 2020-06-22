import * as mdns from 'dnssd';
import * as http from 'http';
import SocketIO from 'socket.io';
import SocketIOClient from 'socket.io-client';

import {getServerAdvertiser, getServerBrowser} from './discovery';
import * as Logger from './log';
import {defaultIF} from './util';
import { createHash } from 'crypto';
import { machineIdSync } from 'node-machine-id';

const log = Logger.get('WSCOMM');

/**
 * Create a unique identifier for this node user-chosen name.
 * This Identifier is unique for for every machine.
 * @param name name of this node
 */
function unique_node_id(name: string)
{
    let idstring = machineIdSync();
    return createHash('sha1').update(`${idstring}-${name}`).digest("base64");
}

interface NodeIdentification {
    id: string, name: string
}

enum SISessionState {
    OFFLINE,
    CONNECT_NODE,
    WAIT_DSP,
    ONLINE,
    RECONNECTING
}

enum SIClientState {
    OFFLINE,
    CONNECTING,
    WAIT_SERVER,
    CHECK_DSP,
    ONLINE,
    RECONNECTING
}

const SIClientEvents = {
    EXCHANGE_IDS : '__exchange_id',
    DSP_ONLINE : '__dsp_online'
};

const SISessionEvents = {
    CHECK_DSP : '__check_dsp'
};

/**
 * Represents a connection to a server in the Node
 */
export class SINodeWSClient {
    private _state: SIClientState = SIClientState.OFFLINE;
    private _browser: mdns.Browser;
    private _sock: SocketIOClient.Socket;
    private _new_socks: SocketIOClient.Socket[] = [];
    private _id: NodeIdentification;

    constructor(config: any)
    {
        this._id = {
            name: config.node_name,
            id: unique_node_id(config.node_name)
        }

        log.info(`Browsing for si-servers on ${defaultIF(config.interface)}`);
        this._browser = getServerBrowser(config.interface);
        this._browser.on('serviceUp', this._on_service_discovered.bind(this));
        this._browser.start();
    }

    _on_service_discovered(service: mdns.Service)
    {
        log.info('Discovered new \'si-server\' service with:');

        for (let addr of service.addresses)
            log.info('  addr: ' + addr)

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
            newsock.on('close', this._on_temp_close.bind(this, newsock));

            this._new_socks.push(newsock);
        }   
        
        this._state = SIClientState.CONNECTING
    }

    _service_reconnect(service: mdns.Service)
    {
        if(this._sock)
            this._sock.close();

        this._sock = null;
        this._state = SIClientState.CONNECTING;
        this._service_connect(service);
    }

    _on_socket_connect(socket: SocketIOClient.Socket)
    {
        log.info("Socket connected");
        
        if (this._state == SIClientState.CONNECTING) {
            this._sock
                = this._new_socks.splice(this._new_socks.indexOf(socket), 1)[0];

            this._sock.on(SISessionEvents.CHECK_DSP, this._on_check_dsp.bind(this));
            this._sock.on('disconnect', this._on_socket_close.bind(this));

            this._sock.emit(SIClientEvents.EXCHANGE_IDS, this._id);
            this._state = SIClientState.WAIT_SERVER;
        } else if (this._state == SIClientState.RECONNECTING) {
            this._sock.emit(SIClientEvents.EXCHANGE_IDS, this._id);
            this._state = SIClientState.WAIT_SERVER;
        }
        else {
            while (this._new_socks.length)
                this._new_socks.shift().close();
        }
    }

    _on_check_dsp()
    {
        log.info("Got CHECK_DSP message");
        this._sock.emit(SIClientEvents.DSP_ONLINE, true);
    }

    _on_socket_close(reason: string)
    {
        log.info("Connection lost. Reason: " + reason);

        this._state = SIClientState.RECONNECTING;

        if (reason === 'io server disconnect')
            this._sock.connect();
    }

    _on_temp_close(socket: SocketIOClient.Socket, reason: string)
    {
        let idx = this._new_socks.findIndex(s => s === socket);
        if(idx != -1) {
            log.info(`Remove temp connection ${reason}`);
            this._new_socks.splice(idx, 1);
        }
    }
}


/**
 * Represents the connection to a node in the SI server
 */
class SIServerWSSession {
    private _state: SISessionState = SISessionState.OFFLINE;
    private _sock: SocketIO.Socket;
    private _id: NodeIdentification;
    private _server: SIServerWSServer;

    constructor(socket: SocketIO.Socket, server: SIServerWSServer)
    {
        this._sock   = socket;
        this._server = server;

        this._sock.on(
            SIClientEvents.EXCHANGE_IDS, this._on_exchange_ids.bind(this));

        this._sock.on(
            SIClientEvents.DSP_ONLINE, this._on_dsp_online.bind(this));

        this._sock.on('disconnect', this._on_disconnect.bind(this));

        this._state = SISessionState.CONNECT_NODE;
    }

    _on_exchange_ids(id: NodeIdentification)
    {
        if (this._state == SISessionState.CONNECT_NODE) {
            log.info("Got EXCHANGE_IDS message from " + id.name);
            this._id    = id;
            this._state = SISessionState.WAIT_DSP;
            this._sock.emit(SISessionEvents.CHECK_DSP);
        }
        else {
            log.error('Unexpected exchange_ids message, trashing connection');
            this.destroy();
        }
    }

    _on_dsp_online()
    {
        if (this._state == SISessionState.WAIT_DSP) {
            log.info("Got DSP_ONLINE message from " + this._id.name);
            this._state = SISessionState.ONLINE;
            this._server.addFromNewSessions(this);
        }
        else {
            log.error('Unexpected dsp_online message, trashing connection');
            this.destroy();
        }
    }

    _on_disconnect()
    {
        this._server._on_disconnect(this);
    }

    id()
    {
        return this._id;
    }

    destroy()
    {
        this._sock.disconnect();
    }
}

/**
 * Communications server class
 */
export class SIServerWSServer {

    private _io: SocketIO.Server;
    private _http: http.Server;
    private _mdns_advertiser: mdns.Advertisement;

    private _new_sessions: SIServerWSSession[] = [];
    private _sessions: SIServerWSSession[] = [];

    /**
     * construct a new WebSocket server to communicate with SI DSP Nodes
     * @param options options, merged from config file and command line options
     */
    constructor(config: any)
    {
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
        this._new_sessions.push(new SIServerWSSession(socket, this));
    }

    _on_disconnect(session: SIServerWSSession)
    {
        let idx = this._sessions.findIndex(s => s === session);

        if (idx != -1) {
            log.info("Removing connection for " + session.id().name);
            this._sessions.splice(idx, 1);
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