import history from 'connect-history-api-fallback';
import {Advertisement} from 'dnssd';
import express from 'express';
import * as http from 'http';
import _ from 'lodash';
import SocketIO from 'socket.io';

import {Node, Server, ServerModule} from './core';
import {getWebinterfaceAdvertiser} from './discovery';
import * as Logger from './log';
import {defaultIF} from './util';
import {nodeRoomName, serverRoomName} from './web_interface_defs'
import { RestService } from './rest';

const log = Logger.get('WEBINT');


// join ${nodeid}.${service}.${topic}
// leave ${nodeid}.${service}.${topic}

// join server.${service}.${topic}
// leave server.${service}.${topic}

function logany(...things: any)
{
    log.debug([...things ].join(' '));
}

interface WEBIFEventHandler {
    thisarg: any, handler: (...args: any[]) => void, event: string;
}

interface ServerRoomMembership {
    modules: Record<string, { topics : Record<string, string>}>;
}

interface NodeRoomMembership {
    nodes:
        Record<string,
               { modules : Record<string, { topics : Record<string, string>}>}>
}

class WebInterfaceClient {

    _server: Server;
    _socket: SocketIO.Socket

    _node_memberships: { nodeid: string, module: string, topic: string }[] = [];

    _server_memberships: { module: string, topic: string }[] = [];

    constructor(socket: SocketIO.Socket, server: Server)
    {
        this._socket = socket;
        this._server = server;

        log.info(`New WebInterface connection from agent ${
            this._socket.handshake.headers['user-agent']}`);

        this._socket.on('join-node', this._on_join_node.bind(this));
        this._socket.on('leave-node', this._on_leave_node.bind(this));
        this._socket.on('join-server', this._on_join_server.bind(this));
        this._socket.on('leave-server', this._on_leave_server.bind(this));
        this._socket.on('disconnect', this._on_disconnect.bind(this));
    }

    _on_join_node(nodeid: string, module: string, topic: string)
    {
        let room = nodeRoomName(nodeid, module, topic);
        this._socket.join(room, (err?) => {
            if (err)
                log.error(`Socket could not join room: ` + err);
            else {
                log.verbose(`WebIF joined room ${room}`);

                let memi = this._node_memberships.findIndex(
                    mem => _.isEqual(mem, { nodeid, module, topic }));
                if (memi == -1)
                    this._node_memberships.push({ nodeid, module, topic });

                this._server._notify_join_node_room(
                    this._socket, nodeid, module, topic);
            }
        });
    }

    _on_leave_node(nodeid: string, module: string, topic: string)
    {
        let room = nodeRoomName(nodeid, module, topic);
        this._socket.leave(room, (err?: any) => {
            if (err)
                log.error(`WebIF could not leave room: ` + err);
            else {
                log.verbose(`WebIF left room ${room}`);

                let memi = this._node_memberships.findIndex(
                    mem => _.isEqual(mem, { nodeid, module, topic }));
                if (memi != -1)
                    this._node_memberships.splice(memi, 1);

                this._server._notify_leave_node_room(
                    this._socket, nodeid, module, topic);
            }
        });
    }

    _on_join_server(module: string, topic: string)
    {
        let room = serverRoomName(module, topic);
        this._socket.join(room, (err?) => {
            if (err)
                log.error(`Socket could not join room: ` + err);
            else {
                log.verbose(`WebIF joined room ${room}`);

                let memi = this._server_memberships.findIndex(
                    mem => _.isEqual(mem, { module, topic }));
                if (memi == -1)
                    this._server_memberships.push({ module, topic });

                this._server._notify_join_server_room(
                    this._socket, module, topic);
            }
        });
    }

    _on_leave_server(module: string, topic: string)
    {
        let room = serverRoomName(module, topic);
        this._socket.leave(room, (err?: any) => {
            if (err)
                log.error(`Socket could not leave room: ` + err);
            else {
                log.verbose(`WebIF left room ${room}`);

                let memi = this._server_memberships.findIndex(
                    mem => _.isEqual(mem, { module, topic }));
                if (memi != -1)
                    this._server_memberships.splice(memi, 1);

                this._server._notify_leave_server_room(
                    this._socket, module, topic);
            }
        });
    }

    _on_disconnect()
    {
        this._node_memberships.forEach(membership => {
            log.verbose(`Socket disconnected, leaving room ${
                nodeRoomName(
                    membership.nodeid, membership.module, membership.topic)}`);
            this._server._notify_leave_node_room(
                this._socket, membership.nodeid, membership.module,
                membership.topic);
        });

        this._server_memberships.forEach(membership => {
            log.verbose(`Socket disconnected, leaving room ${
                serverRoomName(membership.module, membership.topic)}`);
            this._server._notify_leave_server_room(
                this._socket, membership.module, membership.topic);
        });
    }

    isMemeberOfServerRoom(module: string, topic: string)
    {
        return this._socket.rooms[serverRoomName(module, topic)] != null;
    }

    isMemeberOfNodeRoom(nodeid: string, module: string, topic: string)
    {
        return this._socket.rooms[nodeRoomName(nodeid, module, topic)] != null;
    }

    socket()
    {
        return this._socket;
    }
}

export default class WebInterface extends ServerModule {

    private _http: http.Server;
    private _expressapp: express.Application;
    private _webif_root: string = __dirname + '/../../../interface/dist';
    private _server: Server;
    private _clients: WebInterfaceClient[] = [];
    private _web_interface_advertiser: Advertisement;
    private _rest: RestService;

    joined(socket: SocketIO.Socket)
    {
    }

    left(socket: SocketIO.Socket)
    {
    }

    init()
    {
        this.events.on('webif-node-notify', (nodeid: string, msg: string) => {
            let node = this.getNode(nodeid);
            if (node) {
                this.broadcastNotification(`NODE ${node.name()}`, msg);
                log.info(`NODE ${node.name()}: ${msg}`);
            }
            else
                log.error(`Could not deliver notification from node ${
                    nodeid}: Node not found. MSG: ${msg}`);
        });

        this.events.on('webif-node-warning', (nodeid: string, msg: string) => {
            let node = this.getNode(nodeid);
            if (node) {
                this.broadcastWarning(`NODE ${node.name()}`, msg);
                log.warn(`NODE ${node.name()}: ${msg}`);
            }
            else
                log.error(`Could not deliver notification from node ${
                    nodeid}: Node not found. MSG: ${msg}`);
        });

        this.events.on('webif-node-error', (nodeid: string, msg: string) => {
            let node = this.getNode(nodeid);
            if (node) {
                this.broadcastError(`NODE ${node.name()}`, msg);
                log.error(`NODE ${node.name()}: ${msg}`);
            }
            else
                log.error(`Could not deliver notification from node ${
                    nodeid}: Node not found. MSG: ${msg}`);
        });

        this.server.add(this._rest);
    }

    constructor(options: any)
    {
        super('webinterface');
        this._expressapp = express();
        this._http       = http.createServer(this._expressapp);

        let static_middleware = express.static(this._webif_root);

        this._expressapp.use((req, res, next) => {
            log.debug(`Request: ` + req.path);
            next();
        });

        this._rest = new RestService();
        this._rest.registerRoutes(this._expressapp);

        this._expressapp.use(static_middleware);
        this._expressapp.use(history(
            { disableDotRule : true, verbose : true, logger : logany }));
        this._expressapp.use(static_middleware);

        if (options.webserver !== false) {
            this._http.listen(options.webserver_port, options.web_interface);
            this._web_interface_advertiser = getWebinterfaceAdvertiser(
                options.webserver_port, options.web_interface);
            this._web_interface_advertiser.start();
            log.info(`Serving webinterface on ${
                defaultIF(options.web_interface)}:${options.webserver_port}`);
        }

        this.io = SocketIO.listen(45040);

        this.io.on('connect', socket => {
            this._handlers.forEach(
                handler => socket.on(
                    handler.event,
                    handler.handler.bind(handler.thisarg, socket)));

            socket.on('disconnect', () => {
                let idx = this._clients.findIndex(cl => cl.socket() == socket);
                if (idx != -1)
                    this._clients.splice(idx, 1);
            });

            this._clients.push(new WebInterfaceClient(socket, this._server));
        });
    }

    checkServerHasSubscribers(module: string, topic: string)
    {
        for (let client of this._clients) {
            if (client.isMemeberOfServerRoom(module, topic))
                return true;
        }
        return false;
    }

    checkNodeHasSubscribers(nodeid: string, module: string, topic: string)
    {
        for (let client of this._clients) {
            if (client.isMemeberOfNodeRoom(nodeid, module, topic))
                return true;
        }
        return false;
    }

    doPublishNode(nodeid: string, module: string, topic: string, event: string,
                  ...data: any[])
    {
        this.io.to(nodeRoomName(nodeid, module, topic)).emit(event, ...data);
    }

    doPublishServer(module: string, topic: string, event: string,
                    ...data: any[])
    {
        this.io.to(serverRoomName(module, topic)).emit(event, ...data);
    }

    attachServer(server: Server)
    {
        this._server = server;
    }

    reportDispatchError(error_string: string, command: string)
    {
    }

    error(err: any)
    {
        this.broadcastError('Server Error', err);
    }

    attachHandler(thisarg: any, module: string, event: string, handler: any)
    {
        log.debug(`Attach handler -${module}.${event}`);
        this._handlers.push(
            { thisarg, handler, event : `-${module}.${event}` });
    }

    broadcastNotification(title: string, message: string)
    {
        this.io.emit('notification', title, message);
    }

    broadcastNodeNotification(node: Node, message: string)
    {
        this.broadcastNotification(node.name(), message);
    }

    broadcastWarning(title: string, message: string)
    {
        this.io.emit('warning', title, message);
    }

    broadcastError(title: string, err: any)
    {
        if (err instanceof Error) {
            this.io.emit('showerror', title, err.message);
        }
        else if (typeof err == 'string') {
            this.io.emit('showerror', title, err);
        }
        else {
            log.error('Unrecognized error type: Error: ' + err);
        }
    }

    broadcastEvent(title: string, ...data: any[])
    {
        this.io.emit(title, ...data);
    }

    _handlers: WEBIFEventHandler[] = [];
    io: SocketIO.Server;
}