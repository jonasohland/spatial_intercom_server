import { Headtracking } from './headtracking'
import express from 'express';
import * as Logger from './log';
import SerialPort from 'serialport';
import { terminal } from 'terminal-kit';
import chalk from 'chalk';
import { SerialHeadtracker, LocalHeadtracker, OutputAdapter } from './headtracker_serial';
import usbDetect from 'usb-detection';
import * as semver from 'semver';

const { cyan } = chalk;
const log = Logger.get('HTK');
import io from 'socket.io';

const htrk_devices: SerialHeadtracker[] = [];

class DummyOutputAdapter extends OutputAdapter {
    process(q: import("./headtracker").Quaternion): void {
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

function runFlashMode(p: SerialPort, options: any)
{
    let htrk = new LocalHeadtracker(p, new DummyOutputAdapter());

    htrk.on('ready', () => {
        htrk.flashNewestFirmware().then(() => {
            exit(0);
        }).catch(err => {
            exit(1);
        })
    });
}

function runLatencyTest(p: SerialPort, options: any)
{
    let htrk = new LocalHeadtracker(p, new DummyOutputAdapter())

    htrk.on('ready', () => {
        htrk.checkLatency().then(() => {
            exit();
        })
    })
}

function runNormalMode(p: SerialPort, options: any)
{
    let wss = io(45040);
    let headtracking = new Headtracking(8887, wss);

    headtracking.addHeadtracker(new LocalHeadtracker(p, new DummyOutputAdapter()), 99, "local");
}

function start(path: string, options: any) {
    
    log.info("Opening port " + path);
    let p = new SerialPort(path, { autoOpen: false, baudRate: 115200 });

    p.on('open', err => {

        log.info("Port is now open");

        if(err) {
            log.error(`Could not open port ${path}, error: ${err.message}`);
            exit(1);
        }

        if(options.flashFirmware)
            return runFlashMode(p, options);

        if(options.testLatency)
            return runLatencyTest(p, options);

        runNormalMode(p, options);
    });

    p.open();
}


export default async function(port: string, options: any) {

    if(options.listPorts)
        return listPorts().then(exit);

    if(!port) {

        if(options.auto) {
            
            return;

        } else {
            console.log("Please select a serial port (↑↓, Enter to confirm): ")
            return selectPort().then(port => start(port, options));
        }
    }

    let p_i = Number.parseInt(port);

    if(!isNaN(p_i))
        port = await findPort(p_i);

    start(port, options);
}