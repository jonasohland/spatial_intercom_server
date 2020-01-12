import * as mdns from 'dnssd';
import io from 'socket.io'
import winston from 'winston'

import * as AudioDevices from './audio_devices'
import * as DSP from './dsp'
import * as DSPModules from './dsp-modules'
import * as IPC from './ipc'
import * as Logger from './log'

const log    = Logger.get('MGT');
const netlog = Logger.get('NET');

export class InstanceID {
    hash: number;
    txt: string;
}

export interface InstanceStatusInformation {
    audiostatus: AudioDevices.Status;
}

export interface InstanceNetworkInformations {
    v4_addr: string;
    ws_port: string;
    htrk_port: string;
}

export class SpatialIntercomInstance {

    name: string;
    id: string;
    io: io.Socket;
    graph: DSP.Graph;
    dsp: IPC.Connection;
    devices: AudioDevices.Manager;
    service_browser: mdns.Browser;

    constructor(nodename: string, nid: string, local: boolean, dsp?: io.Socket)
    {
        this.name = nodename;   
        this.id = nid;

        if (local)
            this.dsp = new IPC.LocalConnection('default');
        else {
            this.dsp = new IPC.RemoteConnection(dsp);
        }

        this.graph = new DSP.Graph(this.dsp);
        this.devices = new AudioDevices.Manager(this.dsp);

        this.dsp.begin();

        this.dsp.on('connection', () => {
            this.graph.sync();
        });
    }
}