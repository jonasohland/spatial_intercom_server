import * as mdns from 'dnssd'
import * as mid from 'node-machine-id'
import * as os from 'os';
import io from 'socket.io-client'

import * as discovery from './discovery'
import * as IPC from './ipc'
import * as server_config from './server_config'
import { SIDSPProcess } from './dsp_child_process';

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
    server_config.loadServerConfigFile();

    let ipc_bridge: IPC.IPCBridge;
    let socket: SocketIOClient.Socket;

    const config  = server_config.merge(options);
    const browser = discovery.getServerBrowser(config.interface);
    const dspp = new SIDSPProcess(options);

    dspp.start();

    browser.on('serviceUp', (service: mdns.Service) => {
        let serveraddr = `ws://${service.addresses[0]}:${service.port}`

        socket = io(serveraddr, { reconnectionDelayMax : 1000 });

        socket.on('__name', () => {
            let id = mid.machineIdSync();
            socket.emit('__name', os.hostname(), id, local_addresses);
        });

        ipc_bridge = new IPC.IPCBridge(socket, serveraddr, 'default');
    });

    browser.start();
}