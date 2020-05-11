import { Headtracking } from './headtracking'
import express from 'express';
import * as Logger from './log';
import SerialPort from 'serialport';
import { terminal } from 'terminal-kit';
import chalk from 'chalk';
import { LocalHeadtracker } from './headtracker_serial';

const { cyan } = chalk;
const log = Logger.get('HTK');

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

function start(path: string) {
    
    log.info("Opening port " + path);
    let p = new SerialPort(path, { autoOpen: false, baudRate: 9600 });

    p.on('open', err => {

        if(err) {
            log.error(`Could not open port ${path}, error: ${err.message}`);
            exit(1);
        }

        let htrk = new LocalHeadtracker(p);

        log.info("Port is now open");
    });

    p.open();
}


export default async function(port: string, options: any) {

    if(options.listPorts)
        return listPorts().then(exit);

    if(!port) {
        console.log("Please select a serial port (↑↓, Enter to confirm): ")
        return selectPort().then(start);
    }

    let p_i = Number.parseInt(port);

    if(!isNaN(p_i))
        port = await findPort(p_i);

    start(port);
}