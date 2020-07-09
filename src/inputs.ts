import {Channel} from './audio_devices';
import {SIServerWSSession} from './communication';
import {
    ManagedNodeStateListRegister,
    ManagedNodeStateMapRegister,
    ManagedNodeStateObject,
    ManagedNodeStateObjectData,
    NodeModule
} from './data';
import * as DSP from './dsp'
import {SIDSPNode} from './instance';
import * as Logger from './log';
import {
    ShowfileManager,
    ShowfileRecord,
    ShowfileSection,
    ShowfileTarget
} from './showfiles';
import WebInterface from './web_interface';

const log = Logger.get('INP');

interface NodeAndInputs {
    max_id: 0;
    si: SIDSPNode;
    inputs: Input[];
}

export class Input extends ShowfileRecord {

    constructor(id: number, name: string, format: DSP.PortTypes)
    {
        super(name);

        this.id   = id;
        this.name = name, this.format = format;
    }

    async plain()
    {
        if (this.id == 3)
            throw 'I dont want to';

        return {
            id : this.id,
            name : this.format,
            format : this.format,
            channels : this.channels.map((ch) => {
                return {
                    i: ch.i, name: ch.name
                }
            })
        };
    }

    restore(data: any): void
    {
        this.build(data);
    }

    build(data: any): void
    {
        Object.assign(this, data);
    }

    id: number;
    name: string;
    format: DSP.PortTypes;
    channels: Channel[] = [];
}

export class InputManager extends ShowfileTarget {

    targetName(): string
    {
        return 'inputs';
    }
    onEmptyShowfileCreate(s: import('./showfiles').Showfile): void
    {
    }

    nodes: NodeAndInputs[];
    // devices: AudioDeviceManager;
    webif: WebInterface;

    constructor(webif: WebInterface, audioDevMan: any,
                sfm: ShowfileManager)
    {
        super();

        let self = this;

        // this.devices = audioDevMan;
        this.nodes   = [];

        this.webif = webif;

        sfm.register(this);

        webif.io.on('connection', socket => {
            socket.on('inputs.update',
                      () => { self.updateInterface(socket).catch(err => {
                          console.log(err);
                      }) });

            socket.on('inputs.add', this.addInput.bind(self));
        });
    }

    async updateInterface(sock: SocketIO.Socket|SocketIO.Server)
    {
        /*let nodes = await this.devices.getAllChannelLists();

        sock.emit('inputs.update', {
            nodes : nodes,
            inputs : this.nodes.map(nd => {
                return {
                    id: nd.si.id, inputs: nd.inputs.map(i => i.plain())
                }
            })
        });*/
    }

    async addInput(input: any)
    {
        /* let ins = this.devices.instances.find(ins => ins.id == input.nodeid);

        let chlist = await ins.devices.getChannelList();

        let chs = chlist.inputs.slice(
            input.ch_start, input.ch_start + input.ch_count);

        let nodeAndInput = this.nodes.find(ni => ni.si.id == input.nodeid);

        if (nodeAndInput == undefined)
            this.nodes.push({ si : ins, inputs : [], max_id : 0 });

        nodeAndInput = this.nodes.find(ni => ni.si.id == input.nodeid);

        log.info(`Added new Input to node ${nodeAndInput.si.name} (chs: ${
            chs.length}, name: ${input.name})`);

        let i = new Input(0, '', 0);

        i.build({
            name : input.name,
            channels : chs,
            format : input.format,
            id : ++nodeAndInput.max_id
        });

        nodeAndInput.inputs.push(i);

        this.updateInterface(this.webif.io);*/
    }
}

export interface NodeAudioInputDescription {
    name: string;
    channel: number;
}

export class NodeAudioInput extends
    ManagedNodeStateObject<NodeAudioInputDescription> {

    _description: NodeAudioInputDescription;

    async set(val: NodeAudioInputDescription)
    {
        this._description.channel = val.channel;
        this._description.name    = val.name;
    }

    async get()
    {
        return this._description;
    }

    constructor(name: string, channel: number)
    {
        super();
        this._description = { name, channel }
    }
}

export class NodeAudioInputList extends ManagedNodeStateMapRegister {

    async remove(name: string, obj: ManagedNodeStateObject<NodeAudioInputDescription>)
    {
    }

    async insert(name: string, obj: ManagedNodeStateObjectData)
    {
        let data = <NodeAudioInputDescription>obj.data;
        return new NodeAudioInput(data.name, data.channel);
    }

    constructor()
    {
        super();
    }
}

export class NodeAudioInputManager extends NodeModule {
    
    destroy() 
    {
    }

    init(): void {
    }

    start(): void {
        this.save().catch(err => {
            log.error("Could write data to node " + err);
        });
    }

    _input_list: NodeAudioInputList;

    constructor()
    {
        super('inputs');
        this._input_list = new NodeAudioInputList();
        this.add(this._input_list, 'input-list');
    }
}