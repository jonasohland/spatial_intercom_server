import chalk from 'chalk'
import io from 'socket.io';
import winston from 'winston'
import Transport from 'winston-transport'

const cformat
    = winston.format.printf(({ level, message, label, timestamp }) => {
        
          let c;

          switch (level) {
              case 'error': c = chalk.red; break;
              case 'warn': c = chalk.yellow; break;
              case 'info': c = chalk.cyan; break;
              default: c = (str: string) => str; break;
          }

          return `[${c(label)}] ${new Date(timestamp).toLocaleTimeString()}: ${
              message}`;
      });

class RemoteConsoleTransport extends Transport {

    server: SocketIO.Server;

    constructor()
    {
        super();
    }

    attach(s: SocketIO.Server)
    {
        this.server = s;

        this.server.on('connection', socket => {

            socket.on('log.request', () => {

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

export const rct = new RemoteConsoleTransport();

export function get(module_name: string): winston.Logger
{

    return winston.createLogger({
        format : winston.format.combine(
            winston.format.label({ label : module_name }),
            winston.format.timestamp(),
            cformat),
        transports :
            [ new winston.transports.Console({ level : 'verbose' }), rct ]
    });
}