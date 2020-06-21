import * as mdns from 'dnssd';
import io from 'socket.io'
import winston, { add } from 'winston'

import * as AudioDevices from './audio_devices'
import * as DSP from './dsp'
import * as VST from './vst';
import * as DSPModules from './dsp_modules'
import * as IPC from './ipc'
import * as Logger from './log'
import { Timecode } from './timecode';

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
    connection: IPC.Connection;
    vst: VST.Manager;
    devices: AudioDevices.Manager;
    service_browser: mdns.Browser;
    addresses: string[];
    tc: Timecode;

    constructor(nodename: string, nid: string, local: boolean, addrs: string[], dsp?: io.Socket)
    {
        this.name = nodename;   
        this.id = nid;
        this.addresses = addrs;

        if (local)
            this.connection = new IPC.LocalConnection('default');
        else {
            this.connection = new IPC.RemoteConnection(dsp);
        }

        this.graph = new DSP.Graph(this.connection);
        this.devices = new AudioDevices.Manager(this.connection);
        this.vst = new VST.Manager(this.connection);
        this.tc = new Timecode(this.connection);

        this.connection.begin();

        this.connection.on('connection', () => {
            this.graph.sync();
            this.vst.waitPluginsScanned();
            this.graph.setInputNode(64);
            this.graph.setOutputNode(64);
        });
    }
}