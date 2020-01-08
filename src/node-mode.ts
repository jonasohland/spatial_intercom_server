import * as IPC from './ipc'
import * as configuration from './config'
import * as discovery from './discovery'
import * as mdns from 'dnssd'
import io from 'socket.io-client'

export function run(options: any) {

    configuration.loadConfigFile();

    const config = configuration.merge(options);
    const browser = discovery.getServerBrowser(config.interface);

    browser.on('serviceUp', (service: mdns.Service) => {
        
        const socket = io(`ws://${service.addresses[0]}:${service.port}`);
        
        socket.on('connect', () => {
            const ipc = new IPC.IPCBridge(socket, 'default');
            ipc.begin();
        });

        socket.on('__name', () => {
            socket.emit('__name', service.name);
        });

    });


    browser.start();
}