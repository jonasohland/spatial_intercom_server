import * as commander from 'commander';
import node_mode from './node_mode';
import server_mode from './server_mode';
import headtracker_mode from './headtracker_mode';
import htrk_bridge_mode from './htrk_bridge_mode';

const program = new commander.Command();

program.version('0.0.1');

program.command('server')
.option('-i, --interface <interface>', 'use this network interface')
.option('-w, --web-interface <interface>')
.option('-n, --node-name <node name>')
.option('-p, --port <port>')
.option('-z, --webserver-port <port>')
.option('--no-webserver')
.action(server_mode);

program.command('node')
.option('-i, --interface <interface>', 'use this network interface')
.option('-n, --node-name <node name>')
.option('-p, --port <port>')
.action(node_mode);

program.command('headtracker [serialport]')
.option('-l, --list-ports', 'Just list the serial ports and exit')
.option('-a, --auto', 'Find headtracker(s) on this system automatically (may be unreliable)')
.option('-h, --hostname', 'send data to this host')
.option('-p, --port', 'send data to this port')
.option('-z, --webserver-port', 'serve the webinterface to this port')
.action(headtracker_mode)

program.command('htrk-bridge [serialport]')
.option('-l, --list-ports', 'Just list the serial ports and exit')
.option('-a, --auto', 'Find headtracker(s) on this system automatically (may be unreliable)')
.option('-p, --port')
.option('-i, --interface')
.option('-n, --native', 'run in native mode (on a headtracker bridge device)')
.action(htrk_bridge_mode);

program.parse(process.argv);
