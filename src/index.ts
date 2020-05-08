import * as commander from 'commander'
import * as node_mode from './node_mode'
import * as server_mode from './server_mode'

const program = new commander.Command();

program.version('0.0.1');

program.command('server')
.option('-i, --interface <interface>', 'use this network interface')
.option('-w, --web-interface <interface>')
.option('-n, --node-name <node name>')
.option('-p, --port <port>')
.option('--no-webserver')
.action(server_mode.run);

program.command('node')
.option('-i, --interface <interface>', 'use this network interface')
.option('-n, --node-name <node name>')
.option('-p, --port <port>')
.action(node_mode.run);

program.parse(process.argv);