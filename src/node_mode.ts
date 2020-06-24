import * as mdns from 'dnssd'
import * as mid from 'node-machine-id'
import * as os from 'os';
import io from 'socket.io-client'
import { SINodeWSClient } from './communication'
import * as discovery from './discovery'
import * as IPC from './ipc'
import * as server_config from './server_config'
import { LocalNodeController } from './dsp_process';
import { log } from 'winston';

const local_addresses = <string[]>[];

const ifaces = os.networkInterfaces();

Object.keys(ifaces).forEach(function(ifname) {
    var alias = 0;
    ifaces[ifname].forEach(function(iface) {
        if ('IPv4' != iface.family || iface.internal) return;
        local_addresses.push(iface.address);
        ++alias;
    });
});

export default function(options: any)
{
    server_config.loadServerConfigFile(options.config);

    const config  = server_config.merge(options);

    const ipc = new IPC.IPCServer();
    const wsclient = new SINodeWSClient(config, ipc);
    const dspp = new LocalNodeController(options, ipc);
    wsclient.addWSInterceptor(dspp);

    dspp.start().catch(err => {
        ;
    });
}