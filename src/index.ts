import 'commander'

import commander from 'commander'
import dnssd from 'dnssd'
import * as http from 'http'
import io from 'socket.io'
import * as ipc from './ipc'

import * as config from './config'
import {Headtracking} from './headtracker'
import * as Logger from './log'
import { copyFileSync } from 'fs'

const log = Logger.get('SRV');

const program = new commander.Command();

program.version('0.0.1');
program.option('-i, --interface <interface>', 'use this network interface')
program.option('-w, --web-interface <interface>')
program.option('-h, --htrk-interface <interface>')
program.parse(process.argv);

let si_server_config = config.merge(program);

const si_server = http.createServer();
const server    = io(si_server);

Logger.rct.attach(server);

const ad
    = new dnssd.Advertisement(dnssd.tcp('http'), 8080, { name : 'si_server' })
          .start();

server.on('connection',
          sock => { log.info('New client connected from '
                             + sock.client.conn.remoteAddress) });


log.info('Searching for headtracking devices'
         + ((si_server_config.htrk_interface != undefined)
                ? ' on interface ' + si_server_config.htrk_interface
                : ''));

const hdtrck = new Headtracking(4009, server, si_server_config.htrk_interface);


si_server.listen(10156,
                 (si_server_config.web_interface)
                     ? si_server_config.web_interface
                     : '0.0.0.0');

const con = new ipc.Connection("default");

con.on("connection", () => {
    con.request("devmgmt", "vst_scan")
        .then(msg => { 
            return con.request("devmgmt", "vst_list");
        })
        .then(msg => {
            return con.request("app", "stop");
        })
        .then(msg => {
            log.info("stopped");
        })
        .catch(reason => { log.error(reason); })
})

con.begin();