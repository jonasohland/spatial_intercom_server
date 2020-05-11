import * as server_config from './server_config'
import { SpatialIntercomServer } from './server'

export default function(options: any) {
    server_config.loadServerConfigFile();
    const server = new SpatialIntercomServer(server_config.merge(options));
}