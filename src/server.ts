import { SpatialIntercomInstance } from './instance';
import * as AudioDevices from './audio_devices'
import * as mdns from 'dnssd';
import io from 'socket.io'
import { EventEmitter } from 'events';
import * as Headtracking from './headtracker'
import * as discovery from './discovery'
import * as Logger from './log'

const log = Logger.get('SRV');

interface SocketAndInstance {
    instance: SpatialIntercomInstance,
    socket?: io.Socket,
    is_remote: boolean
}

export class AudioDeviceManager extends EventEmitter {

    server: io.Server;
    instances: SocketAndInstance[];

    constructor(server: io.Server, instances: SocketAndInstance[])
    {
        super();

        let self = this;
        this.instances = instances;

        server.on('connection', (socket: io.Socket) => {

            socket.on('audiosettings.update', this.handleUpdateRequest.bind(self, socket));

            socket.on('audiosettings.inputdevice.set', (node: string, device: string) => {

                log.info("New input device requested for node " + node + ": " + device);

                self.instances.find(ins => ins.instance.name == node).instance.devices.setInputDevice(device)
                .then(() => {
                    console.log("device set.");
                    socket.emit('audiosettings.operation.done');
                });
            });

            socket.on('audiosettings.outputdevice.set', (node: string, device: string) => {
                log.info("New output device requested for node " + node + ": " + device);
                self.instances.find(ins => ins.instance.name == node).instance.devices.setOutputDevice(device)
                .then(() => {
                    socket.emit('audiosettings.operation.done');
                });
            });

            socket.on('audiosettings.buffersize.set', (node: string, buffersize: number) => {
                log.info("New buffersize requested for node " + node + ": " + buffersize);
                self.instances.find(ins => ins.instance.name == node).instance.devices.setBuffersize(buffersize)
                .then(() => {
                    socket.emit('audiosettings.operation.done');
                });
            });

            socket.on('audiosettings.samplerate.set', (node: string, samplerate: number) => {
                log.info("New samplerate requested for node " + node + ": " + samplerate);
                self.instances.find(ins => ins.instance.name == node).instance.devices.setSamplerate(samplerate)
                .then(() => {
                    socket.emit('audiosettings.operation.done');
                });
            });
        });
    }

    handleUpdateRequest(socket: io.Socket)
    {   
        log.info("Refreshing audio device data")

        this.refreshAllDevices()
        .then((data) => {
            console.log(JSON.stringify(data, null, 4))
            socket.emit('audiosettings.update.done', data);
        })
    }

    async refreshAllDevices() {

        await Promise.all(this.instances.map(ins => ins.instance.devices.refresh()))

        return this.instances.map(ins => { 

            console.log(ins.instance.name);

            let status = ins.instance.devices.status;
            status.nodename = ins.instance.name;

            return status;
        });
    }
}

export class SpatialIntercomServer {

    instances: SocketAndInstance[] = [];
    advertiser: mdns.Advertisement;
    server: io.Server;
    webif_server: io.Server;
    headtracking: Headtracking.Headtracking;
    audio_device_manaer: AudioDeviceManager;

    constructor(config: any)
    {
        let self = this;
        
        this.advertiser = discovery.getServerAdvertiser(config.interface);
        this.server = io(45045);
        this.webif_server = io(45040);
        this.audio_device_manaer = new AudioDeviceManager(this.webif_server, this.instances);

        this.headtracking = new Headtracking.Headtracking(33032, this.webif_server, config.interface);
        this.server.on('connection', this.newInstanceFound.bind(this));
    
        this.advertiser.start();
    }

    newInstanceFound(socket: io.Socket){

        let self = this;

        socket.on('disconnect', (reason) => {
            self.instanceLeft(socket);
        });

        socket.on('__name', name => {

            log.info("New instanced registered with name: " + name);

            let new_instance = new SpatialIntercomInstance(name, false, socket);

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