import {Connection, Requester} from './communication';
import {
    ManagedNodeStateMapRegister,
    ManagedNodeStateObject,
    ManagedNodeStateObjectData,
    NodeModule,
    ServerModule
} from './core';
import {DSPNode, DSPModuleNames} from './dsp_node';
import * as Logger from './log'
import { lowerFirst } from 'lodash';
import { webifResponseEvent } from './web_interface_defs';
import { GraphBuilderInputEvents } from './dsp_graph_builder';

const log = Logger.get('AUDDEV');

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

export class AudioDeviceConfiguration {
    samplerate: number    = 48000;
    buffersize: number    = 1024;
    input_device: string  = '';
    output_device: string = '';
    in : number           = 32;
    out: number           = 32;
}

export interface NodeAudioDevicesInformation {

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

export class NodeSelectedAudioDeviceSettings extends
    ManagedNodeStateObject<[ string, string ]> {

    input: string;
    output: string;
    controller: NodeAudioDevices;

    constructor(ctrl: NodeAudioDevices, input: string, output: string)
    {
        super();
        this.controller = ctrl;
        this.input      = input;
        this.output     = output;
    }

    async set(val: any)
    {
        this.input  = val[0];
        this.output = val[1];
    }

    get()
    {
        return <[ string, string ]>[ this.input, this.output ];
    }

    async apply()
    {
    }
}

export class NodePlaybackSettings extends
    ManagedNodeStateObject<[ number, number ]> {

    srate: number;
    buffersize: number;
    controller: NodeAudioDevices;

    constructor(controller: NodeAudioDevices, srate: number, bufsize: number)
    {
        super();
        this.controller = controller;
        this.srate      = srate;
        this.buffersize = bufsize;
    }

    async set(val: [ number, number ])
    {
        this.srate      = val[0];
        this.buffersize = val[1];
    }

    get()
    {
        return <[ number, number ]>[ this.srate, this.buffersize ];
    }

    async apply()
    {
    }
}

export class NodeAudioDeviceSettings extends ManagedNodeStateMapRegister {

    controller: NodeAudioDevices;

    constructor(ctrl: NodeAudioDevices)
    {
        super();
        this.controller = ctrl;
    }

    hasSettings()
    {
        return (this._objects['io-devices'] != null)
               && (this._objects['playback-settings'] != null)
    }

    default()
    {
        log.verbose('Construct default audio device settings');
        this.add('io-devices',
                 new NodeSelectedAudioDeviceSettings(this.controller, '', ''));
        this.add('playback-settings',
                 new NodePlaybackSettings(this.controller, 48000, 512));
    }

    setIODevices(input: string, output: string)
    {
        if (!this.hasSettings())
            this.default();

        this._objects['io-devices'].set([ input, output ]);
    }

    setPlaypackSettings(srate: number, bufsize: number)
    {
        if (!this.hasSettings())
            this.default();

        this._objects['playback-settings'].set([ srate, bufsize ]);
    }

    async getIODevices(): Promise<[string, string]>
    {
        return this._objects['io-devices'].get();
    }

    async getPlaybackSettings(): Promise<[number, number]>
    {
        return this._objects['playback-settings'].get();
    }

    async remove(name: string, obj: ManagedNodeStateObject<any>)
    {
        switch (name) {
        }
    }

    async insert(name: string, obj: any)
    {

        switch (name) {
            case 'io-devices':
                return new NodeSelectedAudioDeviceSettings(
                    this.controller, obj[0], obj[1]);
            case 'playback-settings':
                return new NodePlaybackSettings(
                    this.controller, obj[0], obj[1]);
        }

        return null;
    }
}

export class NodeAudioDevices extends NodeModule {

    _devmgmt: Requester;
    _dsp: Requester;
    _settings: NodeAudioDeviceSettings;

    _chlis_valid: boolean = false;
    _chlist_cached: ChannelList;

    _idev_list: any[] = [];
    _odev_list: any[] = [];

    _is_open: boolean    = false;
    _is_enabled: boolean = false;

    _config: AudioDeviceConfiguration = new AudioDeviceConfiguration();

    joined(socket: SocketIO.Socket, topic: string)
    {

    }

    left(socket: SocketIO.Socket, topic: string)
    {
        
    }

    async refresh()
    {
        let devices = await this._devmgmt.request('device-list');

        this._idev_list = (<any>devices.data).inputs;
        this._odev_list = (<any>devices.data).outputs;

        this._config.input_device = "";
        this._config.output_device = "";

        let input_device  = await this._devmgmt.request('input-device');
        let output_device = await this._devmgmt.request('output-device');

        let is_open     = await this.isOpen();

        if (input_device.data && (<string>input_device.data).length)
            this._config.input_device = <string>input_device.data;

        if (output_device.data && (<string>output_device.data).length)
            this._config.output_device = <string>output_device.data;

        if (this._config.input_device.length
            && this._config.output_device.length && is_open) {
            let channels = await this._devmgmt.request('device-channels');
            // console.log(channels);
        }

        let srate = (await this._devmgmt.request('samplerate')).data;
        let bsize = (await this._devmgmt.request('buffersize')).data;

        this._config.buffersize = <number>bsize;
        this._config.samplerate = <number>srate;

        this.writeSettingsToDB();
    }

    async getNodeDevicesInformation(): Promise<NodeAudioDevicesInformation>
    {
        await this.refresh();

        return {
            nodename : this._parent.name(),
            id : this._parent.id(),

            options : {
                audioIns : this._idev_list,
                audioOuts : this._odev_list,
                buffersizes : [ 32, 64, 128, 256, 512, 1024 ],
                samplerates : [ 44100, 48000 ]
            },

            audioInputDevice : this._config.input_device,
            audioOutputDevice : this._config.output_device,

            samplerate : this._config.samplerate,
            buffersize : this._config.buffersize,

            dspUse : 0,
            latency : 0,

            device_open : this._is_open,
            dsp_on : this._is_enabled
        };
    }

    async getChannelList()
    {
        if (this._chlis_valid)
            return this._chlist_cached;

        let channels = <{ inputs : string[], outputs : string[] }>(
                           await this._devmgmt.request('device-channels'))
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

        this._chlist_cached = <ChannelList><unknown>channels;
        this._chlis_valid   = true;

        return <ChannelList><unknown>channels;
    }

    async open()
    {
        if (!(await this.isOpen())) {
            await this._devmgmt.setTmt('open', 20000, true);
            this._is_open = await this.isOpen();
        }
    }

    async close()
    {
        await this._devmgmt.set('open', false);
        this._is_open = await this.isOpen();
        return
    }

    async isOpen()
    {
        let is_open = await this._devmgmt.request('open');
        return is_open.data ? true : false;
    }

    async enable()
    {
        await this._dsp.set('is-enabled', true);
        this._is_enabled = await this.isEnabled();
    }

    async disable()
    {
        await this._dsp.set('is-enabled', false);
        this._is_enabled = await this.isEnabled();
    }

    async isEnabled()
    {
        return this._dsp.requestTyped('is-enabled').bool();
    }

    async setInputDevice(dev: string)
    {
        this._chlis_valid = false;
        await this._devmgmt.set('input-device', dev);
        this._config.input_device = dev;
        this.writeSettingsToDB();
        return;
    }

    async setOutputDevice(dev: string)
    {
        this._chlis_valid = false;
        await this._devmgmt.set('output-device', dev);
        this._config.output_device = dev;
        this.writeSettingsToDB();
    }

    async setSamplerate(rate: number)
    {
        let was_open = await this.isOpen();

        if (was_open)
            await this.close();

        let ret = await this._devmgmt.set('samplerate', rate);

        if (was_open)
            await this.open();

        this._config.samplerate = rate;
        this.writeSettingsToDB();
        return ret;
    }

    async setBuffersize(size: number)
    {
        let was_open = await this.isOpen();

        if (was_open)
            await this.close();

        let ret = await this._devmgmt.set('buffersize', size);

        if (was_open)
            await this.open();

        this._config.buffersize = size;
        this.writeSettingsToDB();
        return ret;
    }

    async reloadSettingsFromDB()
    {
        if(this._settings.hasSettings()) {
            let iodev = await this._settings.getIODevices();
            let playset = await this._settings.getPlaybackSettings();

            await this.setInputDevice(iodev[0]);
            await this.setOutputDevice(iodev[1]);
            await this.setSamplerate(playset[0]);
            await this.setBuffersize(playset[1]);

            if(this._is_open) {
                await this.open();
                if(this._is_enabled)
                    await this.enable();
            }
        }
    }

    writeSettingsToDB()
    {
        this._settings.setIODevices(
            this._config.input_device, this._config.output_device);
        this._settings.setPlaypackSettings(
            this._config.samplerate, this._config.buffersize);
        this._settings.save();
    }

    destroy()
    {
        if (this._devmgmt)
            this._devmgmt.destroy();

        if (this._dsp)
            this._dsp.destroy();
    }

    init()
    {
    }

    start(remote: Connection)
    {
        this._devmgmt = remote.getRequester('devmgmt');
        this._dsp     = remote.getRequester('dsp');

        if (!this._settings.hasSettings())
            this._settings.default();

        this._devmgmt.on('device-type-changed', (msg) => {
            console.log(msg);
            if(msg && msg.data && typeof msg.data == 'string') 
                this.events.emit('webif-node-warning', this.myNodeId(), `Audio device type changed to: ${msg.data}`);
        });

        this.events.on('dsp-started', () => {
            this.reloadSettingsFromDB().then(() => {
                log.info("Restored DSP settings from DB");
            }).catch(err => {
                log.error("Could not restore settings from DB: " + err);
            });
        });

        this.reloadSettingsFromDB().then(() => {
            log.info("Restored DSP settings from DB");
        }).catch(err => {
            log.error("Could not restore settings from DB: " + err);
        });

        this.save();
    }

    constructor()
    {
        super(DSPModuleNames.AUDIO_DEVICES);

        this._settings = new NodeAudioDeviceSettings(this);
        this.add(this._settings, 'audio-device-settings');
    }
}

export class AudioDevices extends ServerModule {

    joined(socket: SocketIO.Socket, topic: string)
    {

    }

    left(socket: SocketIO.Socket, topic: string)
    {
        
    }

    init()
    {
        this.handleWebInterfaceEvent('update', (socket, node: DSPNode, data) => {
            log.info(`Refreshing audio device data for node ${node.name()}`);
            node.audio_devices.getNodeDevicesInformation()
                .then((data) => {
                    socket.emit('audiosettings.update.done', data);
                })
                .catch(this.endTransactionWithError.bind(this, socket));
        });

        this.handleWebInterfaceEvent('inputdevice', (socket, node: DSPNode, data) => {
            node.audio_devices.setInputDevice(data)
                .then(this.endTransaction.bind(this, socket))
                .catch(this.endTransactionWithError.bind(this, socket));
        });

        this.handleWebInterfaceEvent('outputdevice', (socket, node: DSPNode, data) => {
            node.audio_devices.setOutputDevice(data)
                .then(this.endTransaction.bind(this, socket))
                .catch(this.endTransactionWithError.bind(this, socket));
        });

        this.handleWebInterfaceEvent('buffersize', (socket, node: DSPNode, data: number) => {
            node.audio_devices.setBuffersize(data)
                .then(this.endTransaction.bind(this, socket))
                .catch(this.endTransactionWithError.bind(this, socket));
        });

        this.handleWebInterfaceEvent('samplerate', (socket, node: DSPNode, data: number) => {
            node.audio_devices.setSamplerate(data)
                .then(this.endTransaction.bind(this, socket))
                .catch(this.endTransactionWithError.bind(this, socket));
        });

        this.handleWebInterfaceEvent('dspenabled', (socket, node: DSPNode, data: boolean) => {
            if (data) {
                node.audio_devices.enable()
                    .then(() => {
                        socket.emit('audiosettings.done');
                        this.emitToModule(node.id(), DSPModuleNames.GRAPH_BUILDER, GraphBuilderInputEvents.FULL_REBUILD);
                    })
                    .catch(this.endTransactionWithError.bind(this, socket));
            }
            else {
                node.audio_devices.disable()
                    .then(this.endTransaction.bind(this, socket))
                    .catch(this.endTransactionWithError.bind(this, socket));
            }
        });

        this.handleWebInterfaceEvent('open', (socket, node: DSPNode, data: boolean) => {
            if (data) {
                node.audio_devices.open()
                    .then(this.endTransaction.bind(this, socket))
                    .catch(this.endTransactionWithError.bind(this, socket));
            }
            else {
                node.audio_devices.close()
                    .then(this.endTransaction.bind(this, socket))
                    .catch(this.endTransactionWithError.bind(this, socket));
            }
        });

        this.handleWebInterfaceEvent('dspuse', (socket, node: DSPNode) => {

                              });

        this.handleWebInterfaceEvent('channellist', (socket, node: DSPNode) => {
            node.audio_devices.getChannelList().then(chlist => {
                console.log(webifResponseEvent(node.id(), 'audiosettings', 'channellist'));
                socket.emit(webifResponseEvent(node.id(), 'audiosettings', 'channellist'), chlist);
            }).catch(err => {
                socket.emit(webifResponseEvent(node.id(), 'audiosettings', 'channellist'), null);
                // TODO: error handling for Error objects
                this.webif.error("Could not retrieve channel list for node " + node.name() + ": " + err);
            });
        });
    }

    endTransaction(socket: SocketIO.Socket)
    {
        socket.emit('audiosettings.done');
    }

    endTransactionWithError(socket: SocketIO.Socket, error: any)
    {
        socket.emit('audiosettings.done');
        this.webif.error(error);
    }

    constructor()
    {
        super('audiosettings');
    }
}
