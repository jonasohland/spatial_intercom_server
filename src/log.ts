import chalk from 'chalk'
import io from 'socket.io';
import {inherits} from 'util';
import winston, {level, Logger} from 'winston'
import Transport from 'winston-transport'

import * as files from './files';

import {TimecodeReader} from './timecode'

const cformat
    = winston.format.printf(({ level, message, label, timestamp, tc }) => {
          let c;

          switch (level) {
              case 'verbose': c = chalk.blue; break;
              case 'error': c = chalk.red; break;
              case 'warn': c = chalk.yellow; break;
              case 'info': c = chalk.cyan; break;
              case 'notice': c = chalk.greenBright; break;
              default: c = (str: string) => str; break;
          }

          return `[${c(chalk.bold(label))}] TC: ${c(chalk.bold(tc))} RT: ${c(chalk.bold(
              new Date(timestamp).toLocaleTimeString()))} MSG: ${c(message)}`;
      });

class RemoteConsoleTransport extends Transport {

    server: SocketIO.Server;

    constructor()
    {
        super();
        this.setMaxListeners(20);
    }

    attach(s: SocketIO.Server)
    {
        this.server = s;

        this.server.on('connection', socket => {
            socket.on('log.request',
                      () => {

                      });
        });

        this.server.sockets.emit('log.attached');
    }

    log(info: any, callback: any)
    {
        if (this.server)
            this.server.sockets.emit('global_log', {
                message: info[Symbol.for('message')],
                    level: info[Symbol.for('level')]
            });

        callback();
    }
}

const tcreader: { rd?: TimecodeReader } = {};
const log_lvl                           = {
    v : process.env.SI_LOG_LVL || 'info'
};
const transports: Transport[] = [];
let log: { l?: Logger }       = {};

const tcformat = winston.format((info, options) => {
    if (tcreader.rd) {
        if (tcreader.rd._running)
            info.tc = tcreader.rd._currenttc;
        else
            info.tc = 'stopped';
    }
    else
        info.tc = 'stopped';

    return info;
});


const logfilename = files.configFileDir('logs/')
                    + new Date(Date.now()).toISOString().replace(/[.,:]/g, '_')
                    + '.log';

function _init()
{
    log.l = get('LOGGER', true);
    log.l.debug('Writing logs to ' + logfilename);
}

export function setLogDevice(tcr: TimecodeReader)
{
    tcreader.rd = tcr;
}

export function setLogLVL(lvl: number)
{
    const lvls = [ 'crit', 'error', 'warning', 'notice', 'info', 'debug' ];

    if (lvl >= lvls.length || lvl < 0) {
        console.error(`Log level out of range [${0},${lvls.length - 1}]`);
        process.exit(5);
    }

    log_lvl.v = lvls[lvl];

    transports.forEach(t => t.level = lvls[lvl]);
}

export function get(module_name: string, init?: boolean): winston.Logger
{
    if (!init && log.l == undefined)
        _init();

    if (!init)
        log.l.debug('Initializing logger for ' + module_name);

    let cslt = new winston.transports.Console({
        level : log_lvl.v,
        format : winston.format.combine(
            tcformat(),
            winston.format.label({ label : module_name }),
            winston.format.timestamp(),
            cformat),
    });

    let filet = new winston.transports.File({
        filename : logfilename,
        level : 'debug',
        format : winston.format.combine(
            tcformat(), winston.format.json(), winston.format.timestamp())
    });

    transports.push(cslt);

    return winston.createLogger({ transports : [ cslt, filet ] });
}