import { Node } from './data';
import { NodeIdentification } from './communication';
import { NodeAudioInputManager } from './inputs';
import { DSPController } from './dsp_process';
import { Graph } from './dsp';
import { VSTScanner } from './vst';
import { NodeAudioDevices } from './audio_devices';
import { NodeUsersManager } from './users';
import { NodeRooms } from './rooms';

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
    dsp_process: DSPController;
    audio_devices: NodeAudioDevices;

    constructor(id: NodeIdentification)
    {
        super(id);
        this.inputs = new NodeAudioInputManager();
        this.users = new NodeUsersManager();
        this.rooms = new NodeRooms();
        this.vst = new VSTScanner();
        this.dsp_process = new DSPController(this.vst);
        this.audio_devices = new NodeAudioDevices();
        this.add(this.inputs);
        this.add(this.users);
        this.add(this.rooms);
        this.add(this.dsp_process);
        this.add(this.vst);
        this.add(this.audio_devices);
    }
}