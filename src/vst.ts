import * as ipc from './ipc'
import * as Logger from './log'

const log = Logger.get("VST");

export interface PluginDescription {
    category: string;
    display_name: string;
    manufacturer: string;
    name: string;
    platform_id: string;
    version: string;
}

export class Manager {

    knownPlugins: PluginDescription[] = [];
    requester: ipc.Requester;

    constructor(con: ipc.Connection)
    {
        this.requester = con.getRequester("vst");

        let self = this;

        this.requester.connection.on("connection", () => {
            
            log.info("Refreshing Plugin List");

            self.knownPlugins.length = 0;
            
            /* self.refreshPluginList().catch(err => {
                log.error("Could not refresh plugin list: " + err);
            }).then(() => {
                log.info("Found a total of " + this.knownPlugins.length + " Plugins");
            });*/

        });
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