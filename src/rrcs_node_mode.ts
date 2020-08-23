import { SINodeWSClient, NodeMessageHandler, NODE_TYPE, NodeMessageInterceptor, Message, MessageMode } from "./communication";
import { NodeDataStorage } from './core'
import * as server_config from './server_config';
import { RRCSService } from "./rrcs";
import { CrosspointSync, XPSyncModifySlavesMessage } from './rrcs_defs';

class DummyMessageHandler extends NodeMessageHandler {
    send(msg: string): boolean {
        throw new Error("Method not implemented.");
    }
}

class RRCSMessageInterceptor extends NodeMessageInterceptor {

    rrcs: RRCSService;

    constructor(rrcs_host: string, rrcs_port: number)
    {
        super();
        this.rrcs = new RRCSService(rrcs_host, rrcs_port);

        this.rrcs.onAny((evt: string, arg) => {
            this.event(evt, arg);
        })
    }

    target() {
        return "rrcs";
    }

    async handleMessage(msg: Message, from_ipc: boolean): Promise<any> {
        switch(msg.field) {
            case "state": {
                return this.rrcs.getArtistState();
            }
            case 'add-xp-sync': {
                this.rrcs.addXPSync((<any> msg.data).master, (<any> msg.data).slaves);
                return "ok";
            }
            case 'xp-syncs': {
                let syncs = <CrosspointSync[]> <any> msg.data;
                this.rrcs.setXPSyncs(syncs);
            }
            case 'xp-sync-add-slaves': {
                this.rrcs.xpSyncAddSlaves(<XPSyncModifySlavesMessage> msg.data);
            }
            case 'xp-sync-remove-slaves': {

            }
        }
    }

}
 
export default function(options: any) {

    const type = NODE_TYPE.RRCS_NODE;

    server_config.loadServerConfigFile(options.config);
    const config  = server_config.merge(options);

    let handler = new DummyMessageHandler();
    let client = new SINodeWSClient(config, handler, type);
    const state = new NodeDataStorage(config, options, type);
    const rrcs = new RRCSMessageInterceptor(config.rrcs, 8193);
    client.addWSInterceptor(state);
    client.addWSInterceptor(rrcs);
}