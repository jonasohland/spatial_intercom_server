import * as IPC from './ipc'
import * as Logger from './log'
import { IpcNetConnectOpts } from 'net';

const log = Logger.get("DEV");

class AudioDeviceConfiguration {
    samplerate: number = 48000;
    buffersize: number = 1024;
    input_device: string = "";
    output_device: string = "";
    in: number = 32;
    out: number = 32;
}

export class Manager {
    
    remote: IPC.Requester;

    input_devices: any[] = [];
    output_devices: any[] = [];

    ich_names: string[] = [];
    och_names: string[] = [];

    config: AudioDeviceConfiguration = new AudioDeviceConfiguration();
    
    constructor(con: IPC.Connection) {
        
        this.remote = con.getRequester('devmgmt');

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
            // let channels = await this.remote.request('device-channels');
            // console.log(channels);
        }

    }

    async setConfig() {
        await this.refresh();  
        await this.remote.set('samplerate', this.config.samplerate);
        await this.remote.set('buffersize', this.config.buffersize);
        await this.remote.set('input-device', this.config.input_device);
        await this.remote.set('output-device', this.config.output_device);
    }

    async openDevices() {
        return this.remote.request('device-open', this.config);
    }

    async closeDevices() {
        return this.remote.request('device-close');
    }

}