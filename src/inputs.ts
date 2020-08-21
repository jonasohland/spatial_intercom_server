import {Channel} from './audio_devices';
import {
    ManagedNodeStateListRegister,
    ManagedNodeStateObject,
    NodeModule,
    ServerModule
} from './core';
import {PortTypes} from './dsp_defs';
import {DSPNode, DSPModuleNames} from './dsp_node';
import {NodeAudioInputDescription} from './inputs_defs';
import {SIDSPNode} from './instance';
import * as Logger from './log';
import WebInterface from './web_interface';

const log = Logger.get('INP');


export class NodeAudioInput extends
    ManagedNodeStateObject<NodeAudioInputDescription> {

    _description: NodeAudioInputDescription;

    async set(val: NodeAudioInputDescription)
    {
        this._description = val;
    }

    get()
    {
        return this._description;
    }

    constructor(desc: NodeAudioInputDescription)
    {
        super();
        this._description = desc;
    }
}

export class NodeAudioInputList extends ManagedNodeStateListRegister {

    async remove(obj: ManagedNodeStateObject<NodeAudioInputDescription>)
    {
    }

    async insert(data: NodeAudioInputDescription)
    {
        return new NodeAudioInput(data);
    }
}

export class NodeAudioInputManager extends NodeModule {

    async addInput(input: NodeAudioInputDescription)
    {
        this._input_list.add(new NodeAudioInput(input));
        return this.save();
    }

    async removeInput(id: string)
    {
        this._input_list.removeItem(this._input_list._objects.find(
            obj => (<NodeAudioInputDescription>obj.get()).id == id));

        return this._input_list.save();
    }

    getRawInputDescriptionList()
    {
        return this._input_list._objects.map(
            obj => <NodeAudioInputDescription>obj.get());
    }

    findInputForId(id: string)
    {
        return <NodeAudioInput>this._input_list._objects.find(
            obj => obj.get().id == id);
    }

    destroy()
    {
    }

    init(): void
    {
    }

    start(): void
    {
        this.save().catch(err => {
            log.error('Could write data to node ' + err);
        });
    }

    joined(socket: SocketIO.Socket, topic: string)
    {

    }

    left(socket: SocketIO.Socket, topic: string)
    {
        
    }

    _input_list: NodeAudioInputList;

    constructor()
    {
        super(DSPModuleNames.INPUTS);
        this._input_list = new NodeAudioInputList();
        this.add(this._input_list, 'input-list');
    }
}

export class AudioInputsManager extends ServerModule {

    joined(socket: SocketIO.Socket, topic: string)
    {

    }

    left(socket: SocketIO.Socket, topic: string)
    {
        
    }

    broadcastUpdate(node: DSPNode)
    {
        this.webif.broadcastEvent('inputs.update', node.id(),
                                  node.inputs.getRawInputDescriptionList());
    }

    init(): void
    {
        this.handleWebInterfaceEvent('update', (socket, node: DSPNode, data) => {
            try {
                socket.emit('inputs.update', node.id(),
                            node.inputs.getRawInputDescriptionList());
            }
            catch (err) {
                this.webif.error(err);
            }
        });

        this.handleWebInterfaceEvent(
            'add', (socket, node: DSPNode, data: NodeAudioInputDescription) => {
                try {
                    node.inputs.addInput(data);
                    this.broadcastUpdate(node);
                    this.webif.broadcastNotification(
                        node.name(), `Added new input: ${data.name}`)
                }
                catch (err) {
                    this.webif.error(err);
                }
            });

        this.handleWebInterfaceEvent('remove', (socket, node: DSPNode, data: string) => {
            node.inputs.removeInput(data)
                .then(() => {
                    this.webif.broadcastNodeNotification(node, `Input removed`);
                    this.broadcastUpdate(node);
                })
                .catch((err) => {
                    this.webif.error(err);
                });
        });

        this.handleWebInterfaceEvent('modify', (socket, node: DSPNode,
                               data: NodeAudioInputDescription) => {
            try {
                let input = node.inputs.findInputForId(data.id);
                if (input) {
                    input.set(data)
                        .then(() => {
                            this.webif.broadcastNodeNotification(
                                node, `Modified input: ${input.get().name}`);
                            this.broadcastUpdate(node);
                            input.save();
                        })
                        .catch(err => {
                            this.webif.error(err);
                        });
                }
                else {
                    this.webif.error('Input ' + data.name + ' not found');
                }
            }
            catch (err) {
                this.webif.error(err);
            }
        });
    }

    constructor()
    {
        super('inputs');
    }
}