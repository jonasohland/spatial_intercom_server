import winston from 'winston'
import chalk from 'chalk'

const cformat = winston.format.printf(({ level, message, label, timestamp }) => {

    let c;

    switch(level) {
        case 'error':
            c = chalk.red;
            break;
        case 'warn': 
            c = chalk.yellow;
            break;
        case 'info':
            c = chalk.cyan;
            break;
        default:
            c = (str: string) => str;
            break;
    }

    return `[${c(label)}] ${new Date(timestamp).toLocaleTimeString()}: ${message}`;
});

export function get(module_name: string): winston.Logger {

    return winston.createLogger({
        format: winston.format.combine(
            winston.format.label({ label: module_name }),
            winston.format.timestamp(),
            cformat
        ),
        transports: [new winston.transports.Console({level: 'verbose'})]
    });

}