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
.option('-L, --list-ports', 'Just list the serial ports and exit')
.option('-F, --flash-firmware', 'flash the newest firmware to the headtracker')
.option('-T, --test-latency', 'test latency and exit')
.option('-a, --auto', 'Find headtracker(s) on this system automatically (may be unreliable)')
.option('-h, --host <host>', 'Send data to this host', '127.0.0.1')
.option('-p, --port <port>', 'Send data to this port', 8886)
.option('-s, --sample-rate', 'specify sample rate')
.option('-f, --format <format>', 'Output format (euler/quaternion).', 'quaternion')
// .option('-u, --units <unit>', 'Output units (deg/rad)', 'rad')
// .option('-i, --invert <x/y/z>', 'Invert these rotation axises. Example: --invert xz')
// .option('-w, --webserver-port', 'serve the webinterface to this port')
.option('-S, --slow-start')
.option('-P, --preset <preset>', 'Output format preset. Available: IEM', 'IEM')
.option('--quaternion-addr <addresses>', 'Specify osc output addresses for Quaternion output. Requires 4 comma-sepatated values.', "/q/w,/q/x,/q/y,/q/z")
.option('--euler-addr <yaw> <pitch> <roll>', 'Specify osc output addresses for Euler angle output. Requires 3 comma-sepatated values.', "/e/y,/e/p,/e/r")
.action(headtracker_mode)

program.command('htrk-bridge [serialport]')
.option('-l, --list-ports', 'Just list the serial ports and exit')
.option('-a, --auto', 'Find headtracker(s) on this system automatically (may be unreliable)')
.option('-p, --port')
.option('-i, --interface')
.option('-n, --native', 'run in native mode (on a headtracker bridge device)')
.option('-s, --slow-start')
.action(htrk_bridge_mode);  

program.parse(process.argv);
