import * as server_config from './server_config'
import { SpatialIntercomServer } from './server'
import * as log from './log';

export default function(options: any) {

    if(options.logLevel != null)
        log.setLogLVL(options.logLevel);

    server_config.loadServerConfigFile();
    const server = new SpatialIntercomServer(server_config.merge(options));
}