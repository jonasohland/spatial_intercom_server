import EventEmitter from 'events';
import Net from 'net';
import fs from 'fs'
import _ from 'lodash'
import split from 'split2'

import * as Logger from './log'
import { Socket } from 'dgram';
import { Stream } from 'stream';

const log = Logger.get("PIP");

function isNull(v: any){
    return v == null;
}


export enum MessageMode {
    GET = 0, SET, DEL, ALC, RSP
}

function _pipename(name: string): string {
    if (process.platform == "win32")
        return `\\\\.\\pipe\\spat_icom_ipc_${name}`;
    else 
        return `/tmp/spat_icom_ipc_${name}`;
}

function _make_pipe(name: string, callback: (sock: Net.Socket) => void) {

    let pname = _pipename(name);

    if (!(process.platform == "win32") && fs.existsSync(pname))
        fs.unlinkSync(pname);

    let server = Net.createServer(callback).listen(_pipename(name));

    log.info("Created Pipe on " + _pipename(name));

    return server;
}

function _log_msg(msg: Message, input: boolean){

    let to_from = input? "_TO_":"FROM";

    let ty = MessageMode[msg.mode];

    if(_.isObjectLike(msg.data))
        log.info(`Msg ${to_from} DSP: [${msg.target} -> ${msg.field}] [${ty}] -> [data truncated]`);
    else
        log.info(`Msg ${to_from} DSP: [${msg.target} -> ${msg.field}] [${ty}] -> ${msg.data}`);

}

export class Message {

    target: string;
    field: string;
    mode: MessageMode;
    data: number | string | object;

    constructor(tg: string, fld: string, md: MessageMode){
        this.target = tg;
        this.field = fld;
        this.mode = md;
        this.data = null;
    }

    copy(): Message {

        const m = new Message(this.target, this.field, this.mode);

        m.data = this.data;

        return m;
    }

    toString(){
        return JSON.stringify({
            t: this.target,
            f: this.field,
            m: this.mode,
            d: this.data
        });
    }

    static Set(tg: string, fld: string): Message {
        return new Message(tg, fld, MessageMode.SET);
    }

    static Get(tg: string, fld: string): Message {
        return new Message(tg, fld, MessageMode.GET);
    }

    static Del(tg: string, fld: string): Message {
        return new Message(tg, fld, MessageMode.DEL);
    }

    static Alc(tg: string, fld: string): Message {
        return new Message(tg, fld, MessageMode.ALC);
    }

    static Rsp(tg: string, fld: string): Message {
        return new Message(tg, fld, MessageMode.RSP);
    }

    static parse(data: string): Message {

        const obj = <any> JSON.parse(data);

        const checkValue = (v: any, name: string) => {
            if(isNull(v))
                throw new Error("Invalid message, missing " + name + " field");
        }

        checkValue(obj.t, "target");
        checkValue(obj.f, "field");
        checkValue(obj.m, "mode");

        checkValue(obj.d, "data");

        const m = new Message(obj.t, obj.f, obj.m);

        m.data = obj.d;

        return m;
    }

    setInt(i: number){
        this.data = Number.parseInt(""+i);
        return this;
    }

    setFloat(f: number){
        this.data = Number.parseFloat(""+f);
        return this;
    }

    setString(s: string){
        this.data = s;
        return this;
    }

    setArray(arr: any[]){
        this.data = arr;
        return this;
    }

}


export class Connection extends EventEmitter {

    socket: Net.Socket;
    name: string;

    old_data: Buffer;

    constructor(name: string) {
        super();

        this.socket = null;
        this.name = name;
    }

    begin(){

        let self = this;

        _make_pipe(this.name, (sock: Net.Socket) => {
        
            log.info("New Client connected");

            sock.pipe(split('\0')).on("data", data => {
                self.decodeMessage(data);
            });

            sock.on('close', (err: Error) => {
                if(err)
                    log.warn("Client left with Error " + err.message);
                else
                    log.info("Client left");
            });

            sock.on('error', (err: Error) => {
                log.error(err);
            });

            self.socket = sock;
            
            self.emit('connection', sock);
        });

    }

    send(msg: Message){

        _log_msg(msg, true);

        this.socket.write(msg.toString() + '\0');

    }

    decodeMessage(str: string){

        let msg = Message.parse(str);

        _log_msg(msg, false);
        
        this.emit(msg.target, msg);
    }

    async request(tg: string, fld: string, timeout: number, data?: string) : Promise<Message> {

        let self = this

        return new Promise((resolve, reject) => {

            let tmt = setTimeout(() => {

                self.removeListener(tg, response_listener);

                reject("timeout");

            }, timeout || 1000);

            let response_listener = (msg: Message) => {

                self.removeListener(tg, response_listener);

                clearTimeout(tmt);

                resolve(msg);
            }

            let msg = Message.Get(tg, fld);

            msg.data = data;

            this.addListener(tg, response_listener);

            this.send(msg);

        });

    }
}
