import * as mdns from 'dnssd';
import io from 'socket.io'
import winston, { add } from 'winston'

import * as AudioDevices from './audio_devices'
import * as DSP from './dsp'
import * as VST from './vst';
import * as DSPModules from './dsp_modules'
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
    vst: VST.Manager;
    devices: AudioDevices.Manager;
    service_browser: mdns.Browser;
    addresses: string[];

    constructor(nodename: string, nid: string, local: boolean, addrs: string[], dsp?: io.Socket)
    {
        this.name = nodename;   
        this.id = nid;
        this.addresses = addrs;

        if (local)
            this.dsp = new IPC.LocalConnection('default');
        else {
            this.dsp = new IPC.RemoteConnection(dsp);
        }

        this.graph = new DSP.Graph(this.dsp);
        this.devices = new AudioDevices.Manager(this.dsp);
        this.vst = new VST.Manager(this.dsp);


        this.dsp.begin();

        this.dsp.on('connection', () => {
            this.graph.sync();
            this.vst.refreshPluginList();
            this.graph.setInputNode(64);
            this.graph.setOutputNode(64);
        });
    }
}