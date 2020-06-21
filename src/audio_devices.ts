import EventEmitter from 'events';
import {IpcNetConnectOpts} from 'net';
import io from 'socket.io'

import * as IPC from './ipc'
import * as Logger from './log'
import {SocketAndInstance} from './server'

const log = Logger.get('DEV');

export interface Channel {
    i: number;
    name: string;
}

export interface ChannelList {
    inputs: Channel[], outputs: Channel[]
}

export interface NodeAndChannels {
    id: string;
    name: string;
    channels: ChannelList;
}
export interface Status {
    open: boolean, enabled: boolean
}

export class AudioDeviceConfiguration {
    samplerate: number    = 48000;
    buffersize: number    = 1024;
    input_device: string  = '';
    output_device: string = '';
    in : number           = 32;
    out: number           = 32;
}

export interface WEBIFAudioDeviceStatus {

    nodename: string, id: string;

    options: {
        audioIns: string[],
        audioOuts: string[],
        samplerates: number[],
        buffersizes: number[]
    };

    dspUse: number;
    latency: number;

    audioOutputDevice: string;
    audioInputDevice: string;

    samplerate: number;
    buffersize: number;

    dsp_on: boolean;
    device_open: boolean;
}

export class Manager {

    remote: IPC.Requester;
    dsp: IPC.Requester;

    input_devices: any[]  = [];
    output_devices: any[] = [];

    ich_names: string[] = [];
    och_names: string[] = [];

    config: AudioDeviceConfiguration = new AudioDeviceConfiguration();
    status: WEBIFAudioDeviceStatus;

    channel_list_cache: ChannelList;
    channel_list_fresh: boolean = false;

    constructor(con: IPC.Connection)
    {
        this.remote = con.getRequester('devmgmt');
        this.dsp    = con.getRequester('dsp');

        let self = this;
    }

    async refresh()
    {

        let devices = await this.remote.request('device-list');

        this.input_devices  = (<any>devices.data).inputs;
        this.output_devices = (<any>devices.data).outputs;

        let input_device  = await this.remote.request('input-device');
        let output_device = await this.remote.request('output-device');

        if (input_device.data && (<string>input_device.data).length)
            this.config.input_device = <string>input_device.data;

        if (output_device.data && (<string>output_device.data).length)
            this.config.output_device = <string>output_device.data;

        if (this.config.input_device.length
            && this.config.output_device.length) {
            let channels = await this.remote.request('device-channels');
            console.log(channels);
        }

        let is_open     = await this.isOpen();
        let dsp_enabled = (await this.dsp.request('is-enabled')).data;

        let srate = (await this.remote.request('samplerate')).data;
        let bsize = (await this.remote.request('buffersize')).data;

        this.config.buffersize = <number>bsize;
        this.config.samplerate = <number>srate;

        this.status = {

            nodename : 'unknown',
            id : 'unknown',

            audioInputDevice : this.config.input_device,
            audioOutputDevice : this.config.output_device,
            samplerate : this.config.samplerate,
            buffersize : this.config.buffersize,

            options : {
                audioIns : this.input_devices,
                audioOuts : this.output_devices,
                buffersizes : [ 32, 64, 128, 256, 512, 1024 ],
                samplerates : [ 44100, 48000 ]
            },

            dspUse : 0,
            latency : 0,

            device_open : is_open ? true : false,
            dsp_on : (dsp_enabled) ? true : false
        }
    }

    async refreshDSPLoad()
    {
        this.status.dspUse
            = <number>(await this.remote.request('dsp-load')).data;
    }

    async setConfig()
    {
        this.channel_list_fresh = false;
        await this.refresh();
        await this.remote.set('samplerate', this.config.samplerate);
        await this.remote.set('buffersize', this.config.buffersize);
        await this.remote.set('input-device', this.config.input_device);
        await this.remote.set('output-device', this.config.output_device);
    }

    async setInputDevice(dev: string)
    {
        this.channel_list_fresh = false;
        return this.remote.set('input-device', dev);
    }

    async setOutputDevice(dev: string)
    {
        this.channel_list_fresh = false;
        return this.remote.set('output-device', dev);
    }

    async setSamplerate(rate: number)
    {
        let was_open = await this.isOpen();

        if (was_open)
            await this.close();

        let ret = await this.remote.set('samplerate', rate);

        if (was_open)
            await this.open();

        return ret;
    }

    async setBuffersize(size: number)
    {
        let was_open = await this.isOpen();

        if (was_open)
            await this.close();

        let ret = await this.remote.set('buffersize', size);

        if (was_open)
            await this.open();

        return ret;
    }

    async open()
    {
        this.channel_list_fresh = false;
        return this.remote.set('open', true);
    }

    async close()
    {
        this.channel_list_fresh = false;
        return this.remote.set('open', false);
    }

    async isOpen()
    {
        let is_open = await this.remote.request('open');
        return is_open.data ? true : false;
    }

    async enable()
    {
        return this.dsp.set('is-enabled', true);
    }

    async disable()
    {
        return this.dsp.set('is-enabled', false);
    }

    async isEnabled()
    {
        return this.dsp.request('is-enabled');
    }

    async getChannelList()
    {
        if (this.channel_list_fresh)
            return this.channel_list_cache;

        let channels = <{ inputs : string[], outputs : string[] }>(
                           await this.remote.request('device-channels'))
                           .data;

        channels.inputs = <any>channels.inputs.map((ch, i) => {
            return {
                name: ch, i: i
            }
        });

        channels.outputs = <any>channels.outputs.map((ch, i) => {
            return {
                name: ch, i: i
            }
        });

        this.channel_list_cache = <ChannelList><unknown>channels;

        this.channel_list_fresh = true;

        return <ChannelList><unknown>channels;
    }
}

export class AudioDeviceManager extends EventEmitter {

    server: io.Server;
    instances: SocketAndInstance[];

    constructor(server: io.Server, instances: SocketAndInstance[])
    {
        super();

        let self       = this;
        this.instances = instances;

        server.on('connection', (socket: io.Socket) => {
            socket.on('audiosettings.update',
                      this.handleUpdateRequest.bind(self, socket));

            socket.on('audiosettings.inputdevice.set',
                      (node: string, device: string) => {
                          log.info('New input device requested for node ' + node
                                   + ': ' + device);

                          self.instances.find(ins => ins.instance.name == node)
                              .instance.devices.setInputDevice(device)
                              .then(() => {
                                  console.log('device set.');
                                  socket.emit('audiosettings.operation.done');
                              });
                      });

            socket.on('audiosettings.outputdevice.set',
                      (node: string, device: string) => {
                          log.info('New output device requested for node '
                                   + node + ': ' + device);
                          self.instances.find(ins => ins.instance.name == node)
                              .instance.devices.setOutputDevice(device)
                              .then(() => {
                                  socket.emit('audiosettings.operation.done');
                              });
                      });

            socket.on('audiosettings.buffersize.set',
                      (node: string, buffersize: number) => {
                          log.info('New buffersize requested for node ' + node
                                   + ': ' + buffersize);
                          self.instances.find(ins => ins.instance.name == node)
                              .instance.devices.setBuffersize(buffersize)
                              .then(() => {
                                  socket.emit('audiosettings.operation.done');
                              });
                      });

            socket.on('audiosettings.samplerate.set',
                      (node: string, samplerate: number) => {
                          log.info('New samplerate requested for node ' + node
                                   + ': ' + samplerate);
                          self.instances.find(ins => ins.instance.name == node)
                              .instance.devices.setSamplerate(samplerate)
                              .then(() => {
                                  socket.emit('audiosettings.operation.done');
                              });
                      });

            socket.on('audiosettings.dsp.enabled', (node: string,
                                                    is_enabled: boolean) => {
                log.info('Setting new DSP Status for node ' + node + ':'
                         + ((is_enabled) ? 'enabled' : 'disabled'));

                const confirm = (msg: IPC.Message) => {
                    socket.emit('audiosettings.operation.done');
                };
                const do_catch = (err: Error) => {
                    log.error(err);
                };

                if (is_enabled)
                    self.instances.find(ins => ins.instance.name == node)
                        .instance.devices.enable()
                        .then(confirm)
                        .catch(do_catch);
                else
                    self.instances.find(ins => ins.instance.name == node)
                        .instance.devices.disable()
                        .then(confirm)
                        .catch(do_catch);
            });

            socket.on('audiosettings.device.open', (node: string,
                                                    is_open: boolean) => {
                log.info('Setting device open status for node ' + node + ':'
                         + ((is_open) ? 'enabled' : 'disabled'));

                const confirm = (msg: IPC.Message) => {
                    socket.emit('audiosettings.operation.done');
                };
                const do_catch = (err: Error) => {
                    log.error(err);
                };

                if (is_open)
                    self.instances.find(ins => ins.instance.name == node)
                        .instance.devices.open()
                        .then(confirm)
                        .catch(do_catch);
                else
                    self.instances.find(ins => ins.instance.name == node)
                        .instance.devices.close()
                        .then(confirm)
                        .catch(do_catch);
            });

            socket.on('audiosettings.dspuse',
                      () => { this.instances.forEach(ins => {
                          ins.instance.devices.refreshDSPLoad()
                              .then(() => {
                                  socket.emit('audiosettings.dspuse', {
                                      id : ins.instance.id,
                                      value : ins.instance.devices.status.dspUse
                                  });
                              })
                              .catch(err => log.error(err));
                      }) });
        });
    }

    handleUpdateRequest(socket: io.Socket)
    {
        log.info('Refreshing audio device data')

            this.refreshAllDevices()
                .then((data) => {
                    socket.emit('audiosettings.update.done', data);
                })
                .catch(err => log.error(err));
    }

    async refreshAllDevices()
    {

        await Promise.all(
            this.instances.map(ins => ins.instance.devices.refresh()))

        return this.instances.map(ins => {
            console.log(ins.instance.name);

            let status      = ins.instance.devices.status;
            status.nodename = ins.instance.name;
            status.id       = ins.instance.id;

            return status;
        });
    }

    async getAllChannelLists()
    {
        return Promise.all(this.instances.map(async function(ins) {
            return <NodeAndChannels>
            {
                id: ins.instance.id, name: ins.instance.name,
                    channels: await ins.instance.devices.getChannelList()
            }
        }));
    }
}