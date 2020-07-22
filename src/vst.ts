import * as ipc from './ipc'
import * as Logger from './log'
import { Requester, Connection } from './communication';
import { NodeModule } from './core';
import { DSPModuleNames } from './dsp_node';

const log = Logger.get("VST");

export interface PluginDescription {
    category: string;
    display_name: string;
    manufacturer: string;
    name: string;
    platform_id: string;
    version: string;
}

export class VSTScanner extends NodeModule {
    
    destroy()
    {
    }

    init(): void {
    }

    start(remote: Connection): void {
        this.requester = remote.getRequester("vst");
    }

    knownPlugins: PluginDescription[] = [];
    requester: Requester;

    constructor()
    {
        super(DSPModuleNames.VST_SCANNER);
    }

    joined(socket: SocketIO.Socket, topic: string)
    {

    }

    left(socket: SocketIO.Socket, topic: string)
    {
        
    }

    async waitPluginsScanned() {

        await this.requester.requestTmt('wait-scanned', 60000);

        let list = await this.requester.request('list-vst');
    
        if(Array.isArray(list.data))
            this.knownPlugins = list.data;
        else 
            return false;

        return true;
    }

    isPluginInList(name: string)
    {
        return this.findPlugin(name) != undefined;
    }

    findPlugin(name: string) 
    {
        return this.knownPlugins.find(p => p.name == name);
    }
}