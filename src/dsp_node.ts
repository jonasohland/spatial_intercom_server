import { Node } from './core';
import { NodeIdentification, SIServerWSSession } from './communication';
import { NodeAudioInputManager } from './inputs';
import { DSPController } from './dsp_process';
import { Graph } from './dsp_graph';
import { VSTScanner } from './vst';
import { NodeAudioDevices } from './audio_devices';
import { NodeUsersManager } from './users';
import { NodeRooms } from './rooms';

import { v1 as uuid } from 'uuid';
import { NodeDSPGraphBuilder, GraphBuilderInputEvents } from './dsp_graph_builder';
import * as Logger from './log';
import WebInterface from './web_interface';

const log = Logger.get('DSPNOD');

export const DSPModuleNames = {
    INPUTS: 'nodeinputs',
    USERS: 'users',
    ROOMS: 'rooms',
    DSP_PROCESS: 'dsp-process',
    VST_SCANNER: 'vst-scanner',
    AUDIO_DEVICES: 'node-audio-devices',
    GRAPH_BUILDER: 'graph-builder',
}

export class DSPNode extends Node {

    init() { 
    }   

    start() {
        
    }

    destroy()
    {
        
    }

    inputs: NodeAudioInputManager;
    users: NodeUsersManager;
    rooms: NodeRooms;
    vst: VSTScanner;
    dsp_graph: Graph;
    dsp_graph_builder: NodeDSPGraphBuilder;
    dsp_process: DSPController;
    audio_devices: NodeAudioDevices;

    constructor(id: NodeIdentification, webif: WebInterface)
    {
        super(id);
        this.inputs = new NodeAudioInputManager();
        this.users = new NodeUsersManager(this.inputs);
        this.rooms = new NodeRooms();
        this.vst = new VSTScanner();
        this.dsp_process = new DSPController(this.vst, webif);
        this.audio_devices = new NodeAudioDevices();
        this.dsp_graph_builder = new NodeDSPGraphBuilder();
        this.add(this.inputs);
        this.add(this.users);
        this.add(this.rooms);
        this.add(this.dsp_process);
        this.add(this.vst);
        this.add(this.audio_devices);
        this.add(this.dsp_graph_builder);
    }
}