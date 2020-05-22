
import SerialPort from 'serialport';
import * as Logger from './log';
import { terminal } from 'terminal-kit';
import chalk from 'chalk';
import usbDetect from 'usb-detection';
import { lstat } from 'fs';
const { cyan } = chalk;
import * as util from './util';
import * as _ from 'lodash';
const log = Logger.get("BRIDGE");

interface FindableDevice {
    vid: string;
    pid: string;
}

const findable_devices: FindableDevice[] = [
    {
        vid: "6790",
        pid: "29987"
    }
];


class USBDetector { 

    _cached_paths: string[] = [];
    _dev_found_retry_cnt: number = 0;

    constructor() 
    {
        usbDetect.startMonitoring();

        findable_devices.forEach(dev => {
            usbDetect.on(`add:${dev.vid}:${dev.pid}`, this.onDevFound.bind(this));
            usbDetect.on(`remove:${dev.vid}:${dev.pid}`, this.onDevRemoved.bind(this));
        });

        SerialPort.list().then((devs) => {
            this._cached_paths = devs.map(d => d.path);
        })
    }

    async onDevFound(dev: usbDetect.Device) {
        this._dev_found_retry();
    }

    async _dev_found_retry() {

        if(++this._dev_found_retry_cnt >= 10)
            return log.error("Did not register new device");

        let paths = (await SerialPort.list()).map(l => l.path);
        let diff = util.arraydiff(this._cached_paths, paths);

        if(!(diff.length)) {
            return setTimeout(this._dev_found_retry.bind(this), 200);
        }

        console.log("New device:");
        console.log(diff);

        this._dev_found_retry_cnt = 0;
        this._cached_paths = paths;
    }

    async onDevRemoved(dev: usbDetect.Device) {

        let paths = (await SerialPort.list()).map(l => l.path);
        let diff = util.arraydiff(paths, this._cached_paths);

        console.log("Removed:");
        console.log(diff);

        this._cached_paths = paths;
    }   

}

async function findPort(index: number) {
    return SerialPort.list().then(ports => {
        if(ports.length < index || index < 1) {
            log.error("No port found for index " + index);
            exit(1);
        }
        else
            return ports[index - 1].path;
    })
}

async function exit(code?: any) {
    if(!(typeof code == 'number'))
        code = 0;

    terminal.processExit(code);
}

terminal.on( 'key' , (name: string) => {
	if ( name === 'CTRL_C' ) 
        exit(0); 
});

async function listPorts(): Promise<any> {
    return SerialPort.list().then(ports => {
        
        console.log("The following serial ports are available on your device [index] - [port]:")
        console.log();

        ports.forEach((p, i) => {
            console.log(`${cyan('' + (i + 1))} - ${p.path}`);
        });
    })
}

async function selectPort(): Promise<string> {

    return SerialPort.list().then(ports => {
        return terminal.singleColumnMenu(ports.map(p => p.path)).promise
        .then(res => {
            console.log();
            return res.selectedText;
        })
    })
}

function start(path: string, options: any) {
    
    log.info("Opening port " + path);
    let p = new SerialPort(path, { autoOpen: false, baudRate: 115200 });

    p.on('open', err => {

        log.info("Port is now open");

        if(err) {
            log.error(`Could not open port ${path}, error: ${err.message}`);
            exit(20);
        }
    });

    p.open();
}

export default async function(port: string, options: any) 
{
    if(options.listPorts)
        return listPorts().then(exit);

    if(!port) {
        if(options.auto) {
            let detect = new USBDetector();
            return;
        } else {
            console.log("Please select a serial port (↑↓, Enter to confirm): ")
            return selectPort().then(port => start(port, options)).catch(err => {
                log.error("Could not select serial port " + err);
                exit(1);
            })
        }
    }

    let p_i = Number.parseInt(port);

    if(!isNaN(p_i))
        port = await findPort(p_i);

    start(port, options);
}