import { AudioDevices } from './audio_devices'
import {SIServerWSServer, NodeIdentification, NODE_TYPE} from './communication';
import {Headtracking} from './headtracking'
import { AudioInputsManager } from './inputs';
import {SIDSPNode} from './instance';
import * as Logger from './log'
import WebInterface from './web_interface';
import { Server, Node } from './core';
import { DSPNode } from './dsp_node';
import { UsersManager } from './users';
import { Rooms } from './rooms';
import { DSPGraphController } from './dsp_graph_builder';
import { RRCSNode, RRCSServerModule } from './rrcs_node';

const log = Logger.get('SERVER');

export interface SocketAndInstance {
    instance: SIDSPNode,
}

export class SpatialIntercomServer extends Server {

    createNode(id: NodeIdentification): Node {
        switch (id.type) {
            case NODE_TYPE.DSP_NODE:
                return new DSPNode(id, this.webif);
            case NODE_TYPE.RRCS_NODE:
                return new RRCSNode(id);
        }
    }

    destroyNode(node: Node): void {
    }

    webif: WebInterface;
    audio_devices: AudioDevices;
    inputs: AudioInputsManager;
    users: UsersManager;
    rooms: Rooms;
    headtracking: Headtracking;
    graphcontroller: DSPGraphController;
    rrcs: RRCSServerModule;

    constructor(config: any)
    {
        let webif = new WebInterface(config);
        super(new SIServerWSServer(config), webif);
        webif.attachServer(this);

        this._event_bus.on('headtracker-connected', (id) => {
            log.info("Set stream destination of new headtracker");
            let htrk = this.headtracking.getHeadtracker(id);
            htrk.setStreamDest("192.168.178.99", 4009);
        });

        this.webif = webif;
        this.audio_devices = new AudioDevices();
        this.inputs = new AudioInputsManager();
        this.users = new UsersManager();
        this.rooms = new Rooms();
        this.headtracking = new Headtracking(this.webif);
        this.graphcontroller = new DSPGraphController();
        this.rrcs = new RRCSServerModule();
        this.add(this.webif);
        this.add(this.audio_devices);
        this.add(this.inputs);
        this.add(this.users);
        this.add(this.rooms);
        this.add(this.headtracking);
        this.add(this.graphcontroller);
        this.add(this.rrcs);
    }
}