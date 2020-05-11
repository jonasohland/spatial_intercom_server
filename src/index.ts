import * as commander from 'commander';
import node_mode from './node_mode';
import server_mode from './server_mode';
import headtracker_mode from './headtracker_mode';

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

program.command('headtracker [port]')
.option('-l, --list-ports', 'just list the serial ports and exit')
.option('-p, --port', 'serve the webinterface to this port')
.action(headtracker_mode)

program.parse(process.argv);
