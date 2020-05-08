import * as discovery from './discovery';
import * as configuration from './config'
import * as mdns from 'dnssd';
import * as Headtracking from './headtracker'
import { SpatialIntercomInstance } from './instance'
import io from 'socket.io'

import { SpatialIntercomServer } from './server'



export function run(options: any) {

    configuration.loadConfigFile();
    const config = configuration.merge(options);

    const server = new SpatialIntercomServer(config);
}