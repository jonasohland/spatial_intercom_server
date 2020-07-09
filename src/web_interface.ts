import history from 'connect-history-api-fallback';
import express from 'express';
import * as http from 'http';
import SocketIO from 'socket.io';

import * as Logger from './log';
import {defaultIF} from './util';

const log = Logger.get('WEBINT');

function logany(...things: any)
{
    log.debug([...things ].join(' '));
}

interface WEBIFEventHandler {
    thisarg: any, handler: (...args: any[]) => void, event: string
}

export default class WebInterface {

    private _http: http.Server;
    private _expressapp: express.Application;
    private _webif_root: string = __dirname + '/../../../interface/dist';

    constructor(options: any)
    {
        this._expressapp = express();
        this._http       = http.createServer(this._expressapp);

        let static_middleware = express.static(this._webif_root);

        this._expressapp
            .use((req, res, next) => {
                log.debug(`Request: ` + req.path);
                next();
            })

                this._expressapp.use(static_middleware);
        this._expressapp.use(history(
            { disableDotRule : true, verbose : true, logger : logany }));
        this._expressapp.use(static_middleware);

        if (options.webserver !== false) {
            this._http.listen(options.webserver_port, options.web_interface);
            log.info(`Serving webinterface on ${
                defaultIF(options.web_interface)}:${options.webserver_port}`);
        }

        this.io = SocketIO.listen(45040);

        this.io.on('connect', socket => {
            this._handlers.forEach(
                handler => socket.on(
                    handler.event,
                    handler.handler.bind(handler.thisarg, socket)));
        });
    }

    reportDispatchError(error_string: string, command: string)
    {
    }

    error(err: any)
    {
        if(err instanceof Error) {
            this.io.emit('error', err.message);
        } 
        else if(typeof err == 'string') {
            this.io.emit('error', err);
        }
    }

    attachHandler(thisarg: any, module: string, event: string, handler: any)
    {
        log.debug(`Attach handler -${module}.${event}`);
        this._handlers.push(
            { thisarg, handler, event : `-${module}.${event}` });
    }

    _handlers: WEBIFEventHandler[] = [];
    io: SocketIO.Server;
}