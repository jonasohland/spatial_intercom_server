import * as mdns from 'dnssd';
import express from 'express';
import io from 'socket.io'

import * as AudioDevices from './audio_devices'
import * as discovery from './discovery'
import {Headtracking} from './headtracking'
import * as Inputs from './inputs';
import {SIDSPNode} from './instance';
import * as Logger from './log'
import {ShowfileManager, ShowfileTarget} from './showfiles';
import * as tc from './timecode';
import {UsersManager} from './users';
import * as util from './util';
import {Manager} from './vst';
import WebInterface from './web_interface';
import { TcpSocketConnectOpts } from 'net';
import { SIServerWSServer } from './communication';

const log = Logger.get('SERVER');

export interface SocketAndInstance {
    instance: SIDSPNode,
}

export class SpatialIntercomServer {

    instances: SIDSPNode[] = [];

    webif: WebInterface;

    headtracking: Headtracking;
    audio_device_manager: AudioDevices.AudioDeviceManager;
    inputs: Inputs.InputManager
    users: UsersManager;
    showfileman: ShowfileManager;
    tc: tc.Timecode;
    sisrv: SIServerWSServer;

    app: express.Application;

    constructor(config: any)
    {
        // handle all the dependency injection here

        this.webif = new WebInterface(config);

        this.showfileman = new ShowfileManager();

        this.tc = new tc.Timecode(this.instances);

        this.audio_device_manager = new AudioDevices.AudioDeviceManager(
            this.webif, this.instances);

        this.inputs = new Inputs.InputManager(
            this.webif, this.audio_device_manager, this.showfileman);

        this.headtracking = new Headtracking(this.webif, this.showfileman, config.interface);

        this.users = new UsersManager(
            this.webif, this.inputs, this.headtracking);

        this.sisrv = new SIServerWSServer(config);
    }
}