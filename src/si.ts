import * as commander from 'commander';
import node_mode from './node_mode';
import server_mode from './server_mode';
import headtracker_mode from './headtracker_mode';
import htrk_bridge_mode from './headtracker_bridge_mode';
import rrcs_node_mode from './rrcs_node_mode';

const program = new commander.Command();

program.version('0.0.1');

program.command('server')
.option('-i, --interface <interface>', 'use this network interface')
.option('-w, --web-interface <interface>')
.option('-n, --node-name <node name>')
.option('-p, --port <port>')
.option('-z, --webserver-port <port>')
.option('-l, --log-level <loglvl>', 'Set the log level')
.option('-c, --config <config_file>', 'load this config file instead of the default one')
.option('-r, --rrcs <host>', 'hostname or ip address of the rrcs gateway')
.option('--rrcs-osc-host <host>', 'where to send osc messages translated from string sent to rrcs (default: 127.0.0.1)')
.option('--rrcs-osc-port <port>', '(default: 9955)')
.option('--no-webserver', 'dont start a local webserver')
.option('--no-timecode', 'disable timecode data option')
.action(server_mode);

program.command('node')
.option('-i, --interface <interface>', 'use this network interface')
.option('-n, --node-name <node name>')
.option('-R, --reset', 'reset this node before starting')
.option('-D, --dsp-executable <executable>', 'specify where to look for the dsp executable')
.option('-p, --port <port>')
.option('--fail-sense-input <channel>', 'use this channel as fail sense input')
.option('--fail-sense-output <channel>', 'use this channel as fail sense output')
.option('-c, --config <config_file>', 'load this config file instead of the default one')
.action(node_mode);

program.command('headtracker [serialport]')
.option('-L, --list-ports', 'Just list the serial ports and exit')
.option('-F, --flash-firmware', 'Flash the newest firmware to the headtracker.')
.option('-i, --set-id <id>', 'Set the headtrackers id')
.option('-B, --bootloader <bootloader>', 'Target bootloader version (old/new)', 'old')
.option('-O, --osc-control', 'enable headtracker control via osc')
.option('-C, --ctrl-port <port>', 'listen for osc messages on this port', 10010)
.option('-T, --test-latency', 'test latency and exit')
.option('-a, --auto', 'Find headtracker(s) on this system automatically (may be unreliable)')
.option('-h, --host <host>', 'Send data to this host', '127.0.0.1')
.option('-p, --port <port>', 'Send data to this port', 8886)
.option('-s, --sample-rate', 'specify sample rate')
.option('-A, --auto-start', 'start sending packets immediately')
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
.option('--syslog', 'Run in syslog mode. This will remove redundant date/time from log output.')
.option('-s, --slow-start')
.action(htrk_bridge_mode);  

program.command('rrcs')
.option('-i, --interface <interface>', 'use this network interface')
.option('-p, --port <port>')
.option('-s, --server-interface <interface>', 'interface to use for the rrcs notification server')
.option('-g, --gateway <host>', 'hostname or ip address of the rrcs gateway (default: 127.0.0.1)')
.option('-P, --gateway-port <port>', 'connect to rrcs gateway on this port')
.option('--ignore-subtitles', 'dont ask rrcs for port subtitles (artist versions <8)')
.option('--rrcs-osc-host <host>', 'where to send osc messages translated from strings sent to rrcs (default: 127.0.0.1)')
.option('--rrcs-osc-port <port>', '(default: 9955)')
.option('-n, --node-name <node name>')
.option('-R, --reset', 'reset this node before starting')
.option('-c, --config <config_file>', 'load this config file instead of the default one')
.action(rrcs_node_mode);

program.parse(process.argv);
