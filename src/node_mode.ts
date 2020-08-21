import * as os from 'os';
import { SINodeWSClient, NODE_TYPE } from './communication'
import * as IPC from './ipc'
import * as server_config from './server_config'
import { LocalNodeController } from './dsp_process';
import { NodeDataStorage } from './core';

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
    const type = NODE_TYPE.DSP_NODE;

    server_config.loadServerConfigFile(options.config);
    const config  = server_config.merge(options);

    const ipc = new IPC.IPCServer();
    const wsclient = new SINodeWSClient(config, ipc, type);
    const dspp = new LocalNodeController(config, ipc);
    const state = new NodeDataStorage(config, options, type);
    wsclient.addWSInterceptor(dspp);
    wsclient.addWSInterceptor(state);
}