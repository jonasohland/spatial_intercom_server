import EventEmitter from 'events';
import fs from 'fs'
import _ from 'lodash'
import Net from 'net';
import split from 'split2'
import { InstanceID } from './instance'

import * as IOServer from 'socket.io'
import io from 'socket.io-client'

import * as Logger from './log'

const log = Logger.get('PIP');

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

function _log_msg(msg: Message, input: boolean)
{

    let to_from = input ? ' TO ' : 'FROM';

    let ty = MessageMode[msg.mode];

    if (_.isObjectLike(msg.data))
        log.verbose(`Msg ${to_from} DSP: [${msg.target} -> ${msg.field}] [${
            ty}] -> [data truncated]`);
    else
        log.verbose(`Msg ${to_from} DSP: [${msg.target} -> ${msg.field}] [${
            ty}] -> ${msg.data}`);
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

        // we do not require a data field any more
        // checkValue(obj.d, 'data');

        const m = new Message(obj.t, obj.f, obj.m);

        m.data = obj.d;

        if (obj.e && obj.e.length > 0) m.err = obj.e;

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
            if (msg.mode == MessageMode.EVT) this.emit(msg.field);
        });
    }

    async request(value: string, data?: any)
    {
        return this.connection.request(this.request_target, value, 10000, data);
    }

    async requestTmt(value: string, timeout: number, data?: any)
    {
        return this.connection.request(
            this.request_target, value, timeout, data);
    }

    async set(value: string, data?: any)
    {
        return this.connection.set(this.request_target, value, 10000, data);
    }

    async setTmt(value: string, timeout: number, data?: any)
    {
        return this.connection.set(this.request_target, value, timeout, data);
    }
};

export abstract class Connection extends EventEmitter {

    abstract begin(): void;
    abstract send(msg: Message): void;
    abstract isLocal(): boolean;

    async _do_request(req: boolean,
                      tg: string,
                      fld: string,
                      timeout?: number,
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

    async request(tg: string, fld: string, timeout?: number, data?: any):
        Promise<Message>
    {
        return this._do_request(true, tg, fld, timeout, data);
    }

    async set(tg: string, fld: string, timeout?: number, data?: any):
        Promise<Message>
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

            log.info('Remote DSP process connected');

            self.socket.on('disconnect', (reason: string) => {
                log.warn('Remote DSP process disconnected '+ reason);
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
    socket: SocketIOClient.Socket;
    name: string
    connected: boolean;

    constructor(socket: SocketIOClient.Socket , name: string)
    {
        super();
        this.socket = socket;
        this.name = name;
    }

    begin()
    {
        let self = this;

        _make_pipe(this.name, (sock: Net.Socket) => {

            log.info('Local DSP process connected');

            sock.pipe(split('\0')).on('data', data => {
                _log_msg(Message.parse(data), false);
                self.socket.emit('msg', data);
            });

            sock.on('close', (err: Error) => {
                if (err)
                    log.warn('Local DSP process disconnected with error:  '
                             + err.message);
                else
                    log.info('Local DSP process disconnected');

                self.socket.close();
                self.emit('close');
            });

            sock.on('error', (err: Error) => {
                log.error(err);
            });

            self.ipc_socket = sock;
            self.connected = true;
            self.socket.emit('ipc-bridge-begin');
        });

        self.socket.on('msg', (msg: string) => {
            
            _log_msg(Message.parse(msg), true);

            if(self.ipc_socket)
                self.ipc_socket.write(msg + '\0');
        })

        self.socket.on('ipc-bridge-init', () => {

            log.info("Received IPC bridge init msg");

            if(self.connected)
                self.socket.emit('ipc-bridge-begin');
        })
    }
}