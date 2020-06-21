
import chalk from 'chalk';
import {EventEmitter} from 'events';
import * as _ from 'lodash';
import SerialPort from 'serialport';
import {terminal} from 'terminal-kit';
import usbDetect from 'usb-detection';

import {HeadtrackerBridge} from './headtracker_bridge'
import * as Logger from './log';
import * as util from './util';

const log  = Logger.get('BRIDGE');
const ulog = Logger.get('USBHST');

const { cyan } = chalk;

interface FindableDevice {
    vid: string;
    pid: string;
}

const findable_devices: FindableDevice[] = [ { vid : '6790', pid : '29987' } ];

class USBDetector extends EventEmitter {

    _cached_paths: string[]      = [];
    _devlist_refresh_cnt: number = 0;

    start()
    {
        ulog.info('Looking for usb-serial devices...');
        usbDetect.startMonitoring();

        findable_devices.forEach(dev => {
            usbDetect.on(
                `add:${dev.vid}:${dev.pid}`, this._dev_found_retry.bind(this));
            usbDetect.on(
                `remove:${dev.vid}:${dev.pid}`, this._dev_remove.bind(this));
        });

        SerialPort.list().then(devs => {
            this._cached_paths = devs.map(d => d.path);
            this._cached_paths.forEach(this._add_device.bind(this));
        }).catch(err => ulog.error("Failed to list Serial ports: " + err));
    }

    _remove_device(path: string)
    {
        ulog.warn(path + ' removed');
        this.emit('remove' + path);
    }

    _add_device(path: string)
    {
        let m = path.match(/usbserial|ttyUSB/g)

        if (!m || m.length != 1) return;

        ulog.info('Found new device: ' + path);
        this.emit('add', path);
    }

    async _dev_found_retry(dev: usbDetect.Device)
    {
        if (++this._devlist_refresh_cnt >= 40)
            return ulog.error('Could not register new device');

        let paths = (await SerialPort.list()).map(l => l.path);
        let diff  = util.arrayDiff(this._cached_paths, paths);

        if (!(diff.length))
            return setTimeout(this._dev_found_retry.bind(this, dev), 200);

        diff.forEach(this._add_device.bind(this));

        this._devlist_refresh_cnt = 0;
        this._cached_paths        = paths;
    }

    async _dev_remove(dev: usbDetect.Device)
    {
        let paths = (await SerialPort.list()).map(l => l.path);
        let diff  = util.arrayDiff(paths, this._cached_paths);

        diff.forEach(this._remove_device.bind(this));

        this._cached_paths = paths;
    }
}

async function findPort(index: number)
{
    return SerialPort.list().then(ports => {
        if (ports.length < index || index < 1) {
            log.error('No port found for index ' + index);
            exit(1);
        }
        else
            return ports[index - 1].path;
    })
}

async function exit(code?: any)
{
    if (!(typeof code == 'number')) code = 0;

    terminal.processExit(code);
}

terminal.on('key', (name: string) => {
    if (name === 'CTRL_C') exit(0);
});

async function listPorts(): Promise<any>
{
    return SerialPort.list().then(ports => {
        console.log(
            'The following serial ports are available on your device [index] - [port]:');
        console.log();

        ports.forEach((p, i) => {
            console.log(`${cyan('' + (i + 1))} - ${p.path}`);
        });
    });
}

async function selectPort()
{
    return SerialPort.list().then(ports => {
        return terminal.singleColumnMenu(ports.map(p => p.path))
            .promise.then(res => {
                console.log();
                return res.selectedText;
            });
    });
}

function start(path: string, options: any)
{
    log.info('Opening port ' + path);
    let p = new SerialPort(path, { autoOpen : false, baudRate : 115200 });

    p.on('open', err => {
        log.info('Port is now open');

        if (err) {
            log.error(`Could not open port ${path}, error: ${err.message}`);
            exit(20);
        }
    });

    p.open();
}

export default async function(port: string, options: any)
{
    if (options.listPorts) return listPorts().then(exit);

    log.info('Starting up Spatial Intercom Headtracker Bridge');

    const bridge = new HeadtrackerBridge();

    if (!port) {
        if (options.auto) {

            let detect = new USBDetector();

            detect.on('add', bridge.addDevice.bind(bridge));
            detect.on('remove', bridge.removeDevice.bind(bridge));
            detect.start();

            return;
        }
        else {
            console.log('Please select a serial port (↑↓, Enter to confirm): ')
            return selectPort()
                .then(port => start(port, options))
                .catch(err => {
                    log.error('Could not select serial port ' + err);
                    exit(1);
                })
        }
    }

    let p_i = Number.parseInt(port);

    if (!isNaN(p_i)) port = await findPort(p_i);

    start(port, options);
}