import { SpatialIntercomInstance } from './instance';
import * as AudioDevices from './audio_devices'
import * as mdns from 'dnssd';
import io from 'socket.io'
import { EventEmitter } from 'events';
import * as Headtracking from './headtracker'
import * as discovery from './discovery'
import * as Logger from './log'
import { Message } from './ipc';
import * as Inputs from './inputs';

const log = Logger.get('SRV');

export interface SocketAndInstance {
    instance: SpatialIntercomInstance,
    socket?: io.Socket,
    is_remote: boolean
}

export class SpatialIntercomServer {

    instances: SocketAndInstance[] = [];
    advertiser: mdns.Advertisement;
    server: io.Server;
    webif_server: io.Server;
    headtracking: Headtracking.Headtracking;
    audio_device_manager: AudioDevices.AudioDeviceManager;
    inputs: Inputs.InputManager

    constructor(config: any)
    {
        let self = this;
        
        this.advertiser = discovery.getServerAdvertiser(config.interface);
        this.server = io(45045);
        this.webif_server = io(45040);
        this.audio_device_manager = new AudioDevices.AudioDeviceManager(this.webif_server, this.instances);
        this.inputs = new Inputs.InputManager(this.webif_server, this.audio_device_manager);

        this.headtracking = new Headtracking.Headtracking(33032, this.webif_server, config.interface);
        this.server.on('connection', this.newInstanceFound.bind(this));
    
        this.advertiser.start();
    }

    newInstanceFound(socket: io.Socket){

        let self = this;

        socket.on('disconnect', (reason) => {
            self.instanceLeft(socket);
        });

        socket.on('__name', (name, id) => {

            log.info("New instanced registered with name: " + name);

            let new_instance = new SpatialIntercomInstance(name, id, false, socket);

            self.instances.push({
                instance: new_instance,
                socket: socket,
                is_remote: true
            });
        });

        socket.emit('__name');
    }

    instanceLeft(socket: io.Socket) {
        let old = this.instances.splice(this.instances.indexOf(this.instances.find(ins => ins.socket == socket)), 1);
    }
}