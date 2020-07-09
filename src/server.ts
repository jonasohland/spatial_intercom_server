import express from 'express';
import * as fs from 'fs';
import { AudioDevices } from './audio_devices'
import {SIServerWSServer, SIServerWSSession, NodeIdentification, NODE_TYPE} from './communication';
import {DSPController} from './dsp_process';
import {Headtracking} from './headtracking'
import * as Inputs from './inputs';
import {SIDSPNode} from './instance';
import * as Logger from './log'
import {ShowfileManager, ShowfileTarget} from './showfiles';
import * as tc from './timecode';
import WebInterface from './web_interface';
import { StateUpdateStrategy, Server, Node } from './data';
import { DSPNode } from './dsp_node';

const log = Logger.get('SERVER');

export interface SocketAndInstance {
    instance: SIDSPNode,
}

export class SpatialIntercomServer extends Server {

    createNode(id: NodeIdentification): Node {
        if(id.type == NODE_TYPE.DSP_NODE)
            return new DSPNode(id);
    }

    destroyNode(node: Node): void {
    }

    webif: WebInterface;
    audio_devices: AudioDevices;

    constructor(config: any)
    {
        let webif = new WebInterface(config);
        super(new SIServerWSServer(config), webif);

        this.webif = webif;
        this.audio_devices = new AudioDevices();
        this.add(this.audio_devices);
    }
}