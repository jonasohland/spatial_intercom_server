import * as IPC from './ipc'
import * as Logger from './log'
import { IpcNetConnectOpts } from 'net';
import io from 'socket.io'

const log = Logger.get("DEV");

export interface Status {
    open: boolean,
    enabled: boolean
}

export class AudioDeviceConfiguration {
    samplerate: number = 48000;
    buffersize: number = 1024;
    input_device: string = "";
    output_device: string = "";
    in: number = 32;
    out: number = 32;
}

export interface WEBIFAudioDeviceStatus {

    nodename: string,

    options: {
        audioIns: string[],
        audioOuts: string[],
        samplerates: number[],
        buffersizes: number[]
    },

    dspUse: number,
    latency: number,

    audioOutputDevice: string,
    audioInputDevice: string,

    samplerate: number,
    buffersize: number

}

export class Manager {
    
    remote: IPC.Requester;
    dsp: IPC.Requester;

    input_devices: any[] = [];
    output_devices: any[] = [];

    ich_names: string[] = [];
    och_names: string[] = [];

    config: AudioDeviceConfiguration = new AudioDeviceConfiguration();

    status: WEBIFAudioDeviceStatus;
    
    constructor(con: IPC.Connection) {
        
        this.remote = con.getRequester('devmgmt');
        this.dsp = con.getRequester('dsp');

        let self = this;
    }

    async refresh() {

        let devices = await this.remote.request('device-list');

        this.input_devices = (<any> devices.data).inputs;
        this.output_devices = (<any> devices.data).outputs;

        let input_device = await this.remote.request('input-device');
        let output_device = await this.remote.request('output-device');

        if(input_device.data && (<string> input_device.data).length)
            this.config.input_device = <string> input_device.data;

        if(output_device.data && (<string> output_device.data).length)
            this.config.output_device = <string> output_device.data;

        if(this.config.input_device.length && this.config.output_device.length){
            let channels = await this.remote.request('device-channels');
            console.log(channels);
        }

        this.status = {

            nodename: 'unknown',

            audioInputDevice: this.config.input_device,
            audioOutputDevice: this.config.output_device,
            samplerate: this.config.samplerate,
            buffersize: this.config.buffersize,

            options: {
                audioIns: this.input_devices,
                audioOuts: this.output_devices,
                buffersizes: [ 32, 64, 128, 256, 512, 1024 ],
                samplerates: [ 44100, 48000 ]
            },

            dspUse: 0,
            latency: 0
        }

    }

    async refreshDSPLoad() 
    {
        this.status.dspUse = <number> (await this.remote.request('dsp-load')).data;
    }

    async setConfig() 
    {
        await this.refresh();  
        await this.remote.set('samplerate', this.config.samplerate);
        await this.remote.set('buffersize', this.config.buffersize);
        await this.remote.set('input-device', this.config.input_device);
        await this.remote.set('output-device', this.config.output_device);
    }

    async setInputDevice(dev: string)
    {
        return this.remote.set('input-device', dev);
    }

    async setOutputDevice(dev: string)
    {
        return this.remote.set('output-device', dev);
    }

    async setSamplerate(rate: number)
    {
        return this.remote.set('samplerate', rate);
    }

    async setBuffersize(size: number)
    {
        return this.remote.set('buffersize', size);
    }

    async open() 
    {
        return this.remote.set('open', false);
    }

    async close() 
    {
        return this.remote.set('open', false);
    }

    async isOpen()
    {
        return this.remote.request('open');
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

    async getStatus()
    {
        let is_open = await this.isOpen();
        let dspstate = await this.isEnabled();
        
        return <Status> {
            open: (<any> is_open.data) == 'true',
            enabled: (<any> dspstate.data) == 'true'
        }
    }

}