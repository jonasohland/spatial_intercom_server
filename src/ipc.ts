import EventEmitter from 'events';
import fs from 'fs'
import _ from 'lodash'
import Net from 'net';
import * as IOServer from 'socket.io'
import io from 'socket.io-client'
import split from 'split2'

import {InstanceID} from './instance'
import * as Logger from './log'

const log = Logger.get('ICPIPE');

function isNull(v: any)
{
    return v == null;
}


export enum MessageMode {
    GET = 0,
    SET,
    DEL,
    ALC,
    RSP,
    EVT
}

function _pipename(name: string): string
{
    if (process.platform == 'win32')
        return `\\\\.\\pipe\\spat_icom_ipc_${name}`;
    else
        return `/tmp/spat_icom_ipc_${name}`;
}

function _make_pipe(name: string, callback: (sock: Net.Socket) => void)
{
    let pname = _pipename(name);

    if (!(process.platform == 'win32') && fs.existsSync(pname))
        fs.unlinkSync(pname);

    let server = Net.createServer(callback).listen(_pipename(name));

    log.info('Created Pipe on ' + _pipename(name));

    return server;
}

export function _log_msg(msg: Message, input: boolean, forward: boolean = true)
{

    let to_from = input ? ' TO ' : 'FROM';

    let target = forward ?  'DSP' : 'NODE_CONTROLLER'

    let ty = MessageMode[msg.mode];

    if (_.isObjectLike(msg.data))
        log.verbose(`Msg ${to_from} ${target}: [${msg.target} -> ${msg.field}] [${
            ty}] -> [data truncated]`);
    else
        log.verbose(`Msg ${to_from} ${target}: [${msg.target} -> ${msg.field}] [${
            ty}] -> ${msg.data}${msg.err?`: ${msg.err}`:""}`);
}

function deleteLocalPipe(name: string)
{
    if (fs.existsSync(_pipename(name)))
        fs.unlinkSync(_pipename(name));
}

export class IPCServer extends EventEmitter {
    
    _name: string;
    _server: Net.Server;
    _pipe: Net.Socket;
    
    constructor(name: string = 'default') {
        super();
        this._create_server(name);
    }

    _create_server(name: string)
    {
        this._name = name;
        this._server = _make_pipe(this._name, pipe => {

            log.info("Established connection to local dsp process");

            this._pipe = pipe;
            this._server.close();

            // split incoming data at null terminators and process messages
            this._pipe.pipe(split('\0')).on('data', this._on_msg.bind(this));
            
            this._pipe.on('close', had_err => {
                this.emit('closed')
                log.warn('Local pipe broke. Cleaning up.');
                this._create_server(this._name);
                this._pipe = null;
            });

            this.emit('open');
        });
    }

    _on_msg(msg: string)
    {
        this.emit('data', msg);
    }

    send(msg: string)
    {
        // Send a null terminated string. This is ugly, but it works for now...
        if(this._pipe) {
            this._pipe.write(msg + '\0');
            return true;
        } else
            return false;
    }

    connected()
    {
        return this._pipe != null;
    }
}

export class Message {

    target: string;
    field: string;
    err?: string;
    mode: MessageMode;
    data: number|string|object;

    constructor(tg: string, fld: string, md: MessageMode)
    {
        this.target = tg;
        this.field  = fld;
        this.mode   = md;
        this.data   = null;
    }

    copy(): Message
    {
        const m = new Message(this.target, this.field, this.mode);

        m.data = _.cloneDeep(this.data);

        return m;
    }

    toString()
    {
        return JSON.stringify({
            t : this.target,
            f : this.field,
            m : this.mode,
            d : this.data,
            e : this.err
        });
    }

    isError()
    {
        return (this.err != undefined) && this.err.length > 0;
    }

    static Set(tg: string, fld: string): Message
    {
        return new Message(tg, fld, MessageMode.SET);
    }

    static Get(tg: string, fld: string): Message
    {
        return new Message(tg, fld, MessageMode.GET);
    }

    static Del(tg: string, fld: string): Message
    {
        return new Message(tg, fld, MessageMode.DEL);
    }

    static Alc(tg: string, fld: string): Message
    {
        return new Message(tg, fld, MessageMode.ALC);
    }

    static Rsp(tg: string, fld: string): Message
    {
        return new Message(tg, fld, MessageMode.RSP);
    }

    static Event(tg: string, fld: string): Message
    {
        return new Message(tg, fld, MessageMode.EVT);
    }

    static parse(data: string): Message
    {
        const obj = <any>JSON.parse(data);

        const checkValue = (v: any, name: string) => {
            if(isNull(v))
                throw new Error('Invalid message, missing ' + name + ' field');
        }

        checkValue(obj.t, 'target');
        checkValue(obj.f, 'field');
        checkValue(obj.m, 'mode');

        // we do not require a data field anymore
        // checkValue(obj.d, 'data');

        const m = new Message(obj.t, obj.f, obj.m);

        m.data = obj.d;

        if (obj.e && obj.e.length > 0)
            m.err = obj.e;

        return m;
    }

    setInt(i: number)
    {
        this.data = Number.parseInt('' + i);
        return this;
    }

    setFloat(f: number)
    {
        this.data = Number.parseFloat('' + f);
        return this;
    }

    setString(s: string)
    {
        this.data = s;
        return this;
    }

    setArray(arr: any[])
    {
        this.data = arr;
        return this;
    }
}

export class TypedMessagePromise {

    private _p: Promise<Message>;

    constructor(p: Promise<Message>)
    {
        this._p = p;
    }

    private _check_or_throw(ty: string, v: any)
    {
        if (typeof v == ty)
            return true;
        else
            throw ('Unexpected message of type ' + typeof v);
    }

    async str(): Promise<string>
    {
        let v = (await this._p).data;

        if (this._check_or_throw('string', v))
            return <string>v;
    }

    async bool()
    {
        let v = (await this._p).data;

        if (this._check_or_throw('boolean', v))
            return <boolean><unknown>v;
    }

    async obj()
    {
        let v = (await this._p).data;

        if (this._check_or_throw('object', v))
            return <object>v;
    }

    async number()
    {
        let v = (await this._p).data;

        if (this._check_or_throw('number', v))
            return <number>v;
    }

    async float()
    {
        return this.number();
    }

    async int()
    {
        return Math.floor(await this.number());
    }
}

export class Requester extends EventEmitter {

    request_target: string;
    connection: Connection;

    constructor(connection: Connection, target: string)
    {
        super();

        this.request_target = target;
        this.connection     = connection;

        // propagate events to the listener
        this.connection.on(target, (msg: Message) => {
            if (msg.mode == MessageMode.EVT)
                this.emit(msg.field);
        });
    }

    async request(value: string, data?: any)
    {
        return this.connection.request(this.request_target, value, 10000, data);
    }

    requestTyped(value: string, data?: any)
    {
        return new TypedMessagePromise(
            this.connection.request(this.request_target, value, 10000, data));
    }

    async requestTmt(value: string, timeout: number, data?: any)
    {
        return this.connection.request(
            this.request_target, value, timeout, data);
    }

    requestTypedWithTimeout(value: string, timeout: number, data?: any)
    {
        return new TypedMessagePromise(
            this.connection.request(this.request_target, value, timeout, data));
    }

    async set(value: string, data?: any)
    {
        return this.connection.set(this.request_target, value, 10000, data);
    }

    setTyped(value: string, data?: any)
    {
        return new TypedMessagePromise(
            this.connection.set(this.request_target, value, 10000, data));
    }

    async setTmt(value: string, timeout: number, data?: any)
    {
        return this.connection.set(this.request_target, value, timeout, data);
    }

    setTypedWithTimeout(value: string, timeout: number, data?: any)
    {
        return new TypedMessagePromise(
            this.connection.set(this.request_target, value, timeout, data));
    }
};

export abstract class Connection extends EventEmitter {

    abstract begin(): void;
    abstract send(msg: Message): void;
    abstract isLocal(): boolean;

    async _do_request(req: boolean, tg: string, fld: string, timeout?: number,
                      data?: any): Promise<Message>
    {
        let self = this;

        return new Promise((resolve, reject) => {
            let tmt = setTimeout(() => {
                self.removeListener(tg, response_listener);
                reject('timeout');
            }, timeout || 1000);

            let response_listener = (msg: Message) => {
                if (msg.field == fld && msg.mode != MessageMode.EVT) {

                    self.removeListener(tg, response_listener);
                    clearTimeout(tmt);

                    if (msg.isError())
                        reject(new Error(<string>msg.err));
                    else
                        resolve(msg);
                }
            };

            let msg = (req) ? Message.Get(tg, fld) : Message.Set(tg, fld);

            msg.data = data;
            this.addListener(tg, response_listener);
            this.send(msg);
        });
    }

    async request(tg: string, fld: string, timeout?: number,
                  data?: any): Promise<Message>
    {
        return this._do_request(true, tg, fld, timeout, data);
    }

    async set(tg: string, fld: string, timeout?: number,
              data?: any): Promise<Message>
    {
        return this._do_request(false, tg, fld, timeout, data);
    }

    getRequester(target: string)
    {
        return new Requester(this, target);
    }

    decodeMessage(str: string)
    {
        let msg = Message.parse(str);

        _log_msg(msg, false);

        this.emit(msg.target, msg);
    }

    connectionFound()
    {
    }
}

export class LocalConnection extends Connection {

    socket: Net.Socket;
    name: string;

    old_data: Buffer;

    constructor(name: string)
    {
        super();

        this.socket = null;
        this.name   = name;
    }

    isLocal()
    {
        return true;
    }

    begin()
    {
        let self = this;

        _make_pipe(this.name, (sock: Net.Socket) => {
            log.info('Local DSP process connected');

            sock.pipe(split('\0')).on('data', data => {
                self.decodeMessage(data);
            });

            sock.on('close', (err: Error) => {
                if (err)
                    log.warn('Local DSP process disconnected with error:  '
                             + err.message);
                else
                    log.info('Local DSP process disconnected');
            });

            sock.on('error', (err: Error) => {
                log.error(err);
            });

            self.socket = sock;

            self.emit('connection', sock);
        });
    }

    send(msg: Message)
    {
        _log_msg(msg, true);

        this.socket.write(msg.toString() + '\0');
    }
}

export class RemoteConnection extends Connection {

    socket: IOServer.Socket;

    constructor(socket: IOServer.Socket)
    {
        super();
        this.socket = socket;
    }

    begin(): void
    {
        let self = this;

        this.socket.on('ipc-bridge-begin', () => {
            self.socket.removeAllListeners();

            log.info('Remote DSP process connected');

            self.socket.on('disconnect', (reason: string) => {
                log.warn('Remote DSP process disconnected ' + reason);
            });

            self.socket.on('msg', (data: string) => {
                let msg = Message.parse(data);
                self.emit(msg.target, msg);
            });

            self.emit('connection');
        });

        this.socket.emit('ipc-bridge-init');
    }

    send(msg: Message): void
    {
        this.socket.emit('msg', msg.toString());
    }

    isLocal(): boolean
    {
        return false;
    }
}

export class IPCBridge extends EventEmitter {

    ipc_socket: Net.Socket;
    ipc_server: Net.Server;
    socket: SocketIOClient.Socket;
    name: string
    connected: boolean;
    last_server_addr: string;

    constructor(socket: SocketIOClient.Socket, addr: string, name: string)
    {
        super();
        this.socket = socket;
        this.name   = name;

        let self = this;

        this.socket.on('connect', () => {
            log.info('Connected');
            self.begin();
        });

        this.socket.on('disconnect', () => {
            self.reset();
        });

        this.socket
            .on('msg',
                (msg: string) => {
                    let msgobj = Message.parse(msg)

                    _log_msg(msgobj, true);

                    if (self.connected) {
                        if (self.ipc_socket)
                            self.ipc_socket.write(msg + '\0');
                    }
                    else {
                        log.error('Not connected');
                        msgobj.err  = 'NOT CONNECTED';
                        msgobj.mode = MessageMode.RSP;
                        self.emit('msg', msg.toString())
                    }
                })

                this.socket.on('ipc-bridge-init', () => {
                    log.info('Received IPC bridge init msg');

                    if (self.connected)
                        self.socket.emit('ipc-bridge-begin');
                })
    }

    begin()
    {
        let self = this;

        this.ipc_server = _make_pipe(this.name, (pipe) => {
            this.ipc_socket = pipe;

            pipe.pipe(split('\0')).on('data', data => {
                _log_msg(Message.parse(data), false);
                self.socket.emit('msg', data);
            });

            pipe.on('close', (err: Error) => {
                if (err)
                    log.warn('Local DSP process disconnected with error:  '
                             + err.message);
                else
                    log.info('Local DSP process disconnected');

                self.connected = false;
                self.socket.close();
                self.emit('close');
                self.reset();
            });

            pipe.on('error', (err: Error) => {
                log.error(err);
                self.connected = false;
            });

            self.ipc_socket = pipe;
            self.connected  = true;
            self.socket.emit('ipc-bridge-begin');
        });
    }

    reset()
    {
        log.warn('Connection lost, resetting.')

        deleteLocalPipe(this.name);

        if (this.ipc_server) {
            this.ipc_server.close();
            this.ipc_server.removeAllListeners();
        }

        if (this.ipc_socket) {
            this.ipc_socket.end();
            this.ipc_socket.removeAllListeners();
        }
    }
}