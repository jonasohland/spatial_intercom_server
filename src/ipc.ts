import EventEmitter from 'events';
import fs from 'fs'
import _ from 'lodash'
import Net from 'net';
import * as IOServer from 'socket.io'
import io from 'socket.io-client'
import split from 'split2'

import {InstanceID} from './instance'
import * as Logger from './log'
import { NodeMessageHandler } from './communication';

const log = Logger.get('ICPIPE');

function isNull(v: any)
{
    return v == null;
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

export class IPCServer extends NodeMessageHandler {
    
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
            
            this._pipe.on('close', () => {
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



