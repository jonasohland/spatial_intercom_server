import * as IPC from './ipc'
import * as configuration from './config'
import * as discovery from './discovery'
import * as mdns from 'dnssd'
import io from 'socket.io-client'
import * as mid from 'node-machine-id'
import * as os from 'os';

const local_addresses = <string[]> [];

const ifaces = os.networkInterfaces();

Object.keys(ifaces).forEach(function (ifname) {

  var alias = 0;

  ifaces[ifname].forEach(function (iface) {

    if ('IPv4' != iface.family || iface.internal) 
      return;

    local_addresses.push(iface.address);

    ++alias;
  });
});

console.log(local_addresses);

export function run(options: any) {

    configuration.loadConfigFile();

    let ipc_bridge: IPC.IPCBridge;
    let socket: SocketIOClient.Socket;

    const config = configuration.merge(options);
    const browser = discovery.getServerBrowser(config.interface);

    browser.on('serviceUp', (service: mdns.Service) => {

        socket = io(`ws://${service.addresses[0]}:${service.port}`);

        socket.on('__name', () => {
            let id = mid.machineIdSync();
            socket.emit('__name', os.hostname(), id, local_addresses);
        });

        ipc_bridge = new IPC.IPCBridge(socket, 'default');

    });

    browser.start();
}