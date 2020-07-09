import EventEmitter from 'events';
import * as Audio from './audio_devices';
import {BasicSpatializer, BasicUserModule, BasicSpatializerModule, AdvancedSpatializerModule, SpatializationModule } from './dsp_modules';
import * as Inputs from './inputs';
import * as Instance from './instance';
import * as Logger from './log';
import { Headtracking } from './headtracking';
import * as IP from 'ip';
import WebInterface from './web_interface';

const log = Logger.get('USR');

export interface OwnedInput {

    id: number;
    input: Inputs.Input;
    format: string;
    azm: number;
    elv: number;
    stwidth: number;
    mute: boolean;

    dspModule?: SpatializationModule;
}

interface WEBIFNewUserData {
    username: string;
    nodeid: string
    channels: Audio.Channel[];
}


interface WEBIFUserData {
    id: number;
    name: string;
    nodename: string;
    nid: string;
    advanced: boolean;
    htrk: -1;
    selected_inputs: [];
    inputs: OwnedInput[];
}


interface WEBIFNodesAndUsers {
    nodename: string;
    id: string;
    users: WEBIFUserData[];
}

export interface NodeAndUsers {
    si: Instance.SIDSPNode;
    users: User[];
}


export class User {

    id: number;
    name: string;
    advanced: boolean;
    htrk: number = -1;
    inputs: OwnedInput[];
    outputChannels: Audio.Channel[];
    roomsize: number;
    reflections: number;
    room_character: number;
    dspModule?: BasicUserModule;

    constructor(instance: Instance.SIDSPNode, name: string)
    {
        this.name = name;
    }

    setInputMuted(iid: number, muted: boolean)
    {
        let input = this.findInput(iid);

        if (input)
            input.mute = muted;
        else
            return;

        log.info(`Mute status on input ${input.input.name} for user ${
            this.name} set to ${muted}`);
    }

    setInputAzm(iid: number, val: number)
    {
        let input = this.findInput(iid);

        if (input)
            input.azm = val;
        else
            return;

        input.dspModule.setAzm(val);

        log.info(`Azimuth on input ${input.input.name} for user ${
            this.name} set to ${val}`);
    }

    setInputElv(iid: number, val: number)
    {
        let input = this.findInput(iid);

        if (input)
            input.elv = val;
        else
            return;

        input.dspModule.setElv(val);

        log.info(`Elevation on input ${input.input.name} for user ${
            this.name} set to ${val}`);
    }

    setInputStWidth(iid: number, val: number)
    {
        let input = this.findInput(iid);

        if (input)
            input.stwidth = val;
        else
            return;

        input.dspModule.setStWidth(val);

        log.info(`Stereo width on input ${input.input.name} for user ${
            this.name} set to ${val}`);
    }

    findInput(iid: number)
    {
        let input = this.inputs.find(input => input.input.id == iid);

        if (input)
            return input
            else return null
                && log.error('Could not find input ' + iid + ' on user '
                             + this.name);
    }
}

export class UsersManager extends EventEmitter {

    users: NodeAndUsers[] = [];
    webif: WebInterface;
    inputs: Inputs.InputManager;
    htrks: Headtracking;
    max_id = 0;

    constructor(webif: WebInterface, inputs: Inputs.InputManager, htrks: Headtracking)
    {
        super();

        let self    = this;
        this.webif = webif;
        this.inputs = inputs;
        this.htrks = htrks;

        this.webif.io.on('connection', socket => {
            
            socket.on('users.update', () => {
                self.updateInterface(socket);
            });

            socket.on('user.add', data => {
                self.addUser(data);
            })

            socket.on('user.switch.mode', self.switchSpatializationMode.bind(self));

            socket.on('users.inputs.changed', data => {
                self.userInputsChanged(data);
            });

            socket.on('users.reflections', self.setReflections.bind(self));
            socket.on('users.room_character', self.setRoomCharacter.bind(self));

            socket.on('users.input.mute', self.setInputMuted.bind(self));
            socket.on('users.input.azm', self.setInputAzm.bind(self));
            socket.on('users.input.elv', self.setInputElv.bind(self));
            socket.on('users.input.stwidth', self.setInputStWidth.bind(self));
            socket.on('users.htrk.assign', self.assignHeadtracker.bind(self));
        });
    }

    addUser(userdata: WEBIFNewUserData)
    {
        /* let ins  = this.inputs.devices.instances.find(ins => ins.id
                                                            == userdata.nodeid); */
        /* let user = new User(ins, userdata.username);

        user.advanced       = false;
        user.inputs         = [];
        user.id             = ++this.max_id;
        user.outputChannels = userdata.channels;

        let nodeAndUsers = this.users.find(n => n.si.id == userdata.nodeid);

        if (nodeAndUsers == undefined)
            this.users.push({ si : ins, users : [] }); 

        nodeAndUsers = this.users.find(n => n.si.id == userdata.nodeid);

        nodeAndUsers.users.push(user);

        let dspModule = new BasicUserModule(user);

        // ins.graph.addModule(dspModule);
        // ins.graph.sync();

        this.updateInterface(this.webif.io);
        */
    }

    async updateInterface(socket: SocketIO.Server|SocketIO.Socket)
    {
        let update_users: WEBIFNodesAndUsers[] = [];
        let update_aux: any[]                  = [];

        this.users.forEach(node => update_users.push({
            id : node.si.id,
            nodename : node.si.name,
            users : node.users.map(user => {
                return {
                    id : user.id,
                    advanced : user.advanced,
                    nodename : node.si.name,
                    reflections: user.reflections,
                    roomsize: user.roomsize,
                    room_character: user.room_character,
                    name : user.name,
                    nid : node.si.id,
                    selected_inputs : [],
                    htrk: -1,
                    inputs : user.inputs.map(input => {
                        
                        let obj = <any> {};
                        Object.assign(obj, input);

                        // this needs to be deleted because it contains circular dependencies
                        delete obj.dspModule;

                        return obj;
                    })
                };
            })
        }));

        this.inputs.nodes.forEach(nodeAndInput => {
            update_aux.push({
                nodename : nodeAndInput.si.name,
                id : nodeAndInput.si.id,
                inputs : nodeAndInput.inputs
            });
        });

        // let channels = await this.inputs.devices.getAllChannelLists();

        socket.emit(
            'users.update',
            { nodes : update_users, inputs : update_aux, channels : null });

        socket.emit('users.headtrackers.update', this.htrks.trackers.filter(trk => trk.remote.conf).map(trk => trk.remote.id));
    }

    userInputsChanged(data: { id: number, nid: string, inputs: OwnedInput[] })
    {

        let usr = this.findUser(data.nid, data.id);

        if (!usr) return;

        usr.inputs = usr.inputs.filter(el => {

            let idx = data.inputs.findIndex(inp => inp.id == el.id);

            if (idx == -1) {

                log.info(
                    `Input ${el.input.name} removed from user ${usr.name}`);

                let node = this.inputs.nodes.find(n => n.si.id == data.nid);

                if(el.dspModule){
                    node.si.graph.removeModule(el.dspModule);
                    // node.si.graph.sync();
                }

                return false;
            }

            return true;
        });

        data.inputs.forEach(dinp => {

            if (usr.inputs.findIndex(inp => inp.id == dinp.id) == -1) {

                dinp.input = this.inputs.nodes.find(n => n.si.id == data.nid)
                                 .inputs.find(inp => inp.id == dinp.id);

                usr.inputs.push(dinp);

                let node = this.inputs.nodes.find(n => n.si.id == data.nid);

                let input_mod;

                if(usr.advanced)
                    input_mod = new AdvancedSpatializerModule(dinp, usr);
                else
                    input_mod = new BasicSpatializerModule(dinp, usr);

                node.si.graph.addModule(input_mod);
                // node.si.graph.sync();

                log.info(
                    `Added input ${dinp.input.name} added to user ${usr.name}`);
            }
        });

        this.updateInterface(this.webif.io);
    }

    switchSpatializationMode(usr_id: number, nid: string) {
        
        let node = this.users.find(us => us.si.id == nid);
        let usr = node.users.find(us => us.id == usr_id);

        let graph = node.si.graph;

        usr.inputs.forEach(input => {

            graph.removeModule(input.dspModule);

        });

        usr.advanced = !usr.advanced;

        usr.inputs.forEach(input => {

            let new_module;

            if(usr.advanced) 
                new_module = new AdvancedSpatializerModule(input, usr);
            else
                new_module = new BasicSpatializerModule(input, usr);

            graph.addModule(new_module);

        })

        // graph.sync();
    }

    setInputMuted(usr_id: number, nid: string, iid: number, mute: boolean)
    {
        let usr = this.findUser(nid, usr_id);

        if (usr) usr.setInputMuted(iid, mute);
    }

    setInputAzm(usr_id: number, nid: string, iid: number, azm: number)
    {
        let usr = this.findUser(nid, usr_id);

        if (usr) usr.setInputAzm(iid, azm);
    }

    setInputElv(usr_id: number, nid: string, iid: number, elv: number)
    {
        let usr = this.findUser(nid, usr_id);

        if (usr) usr.setInputElv(iid, elv);
    }

    setInputStWidth(usr_id: number, nid: string, iid: number, width: number)
    {
        let usr = this.findUser(nid, usr_id);

        if (usr) usr.setInputStWidth(iid, width);
    }

    findUser(nid: string, userId: number)
    {
        let node = this.users.find(node => node.si.id == nid);

        if (!node)
            return null && log.error('Could not find node for id ' + nid);

        let usr = node.users.find(user => user.id == userId);

        if (!usr)
            return null && log.error('Could not find user with id ' + userId);

        return usr;
    }

    assignHeadtracker(userId: number, nid: string, htrkId: number)
    {
        let node = this.users.find(n => n.si.id == nid);
        let usr = node.users.find(us => us.id == userId);

        usr.htrk = htrkId;

        if(usr.dspModule)
            usr.dspModule.assignHeadtracker(htrkId);

        let trk = this.htrks.trackers.find(htrk => htrk.remote.conf.deviceID() == htrkId);

        if(trk){
            return (trk.setStreamDest(node.si.addresses[0], 45667));
        } else {
            log.error('Headtracker not found');
        }
    }

    setReflections(usr_id: number, nid: string, value: number)
    {
        let node = this.users.find(n => n.si.id == nid);
        let usr = node.users.find(us => us.id == usr_id);

        if(!usr.advanced)
            return;

        usr.inputs.forEach(input => {
            (<AdvancedSpatializerModule> input.dspModule).setReflections(value);
        });
    }

    setRoomCharacter(usr_id: number, nid: string, value: number)
    {
        let node = this.users.find(n => n.si.id == nid);
        let usr = node.users.find(us => us.id == usr_id);

        if(!usr.advanced)
            return;

        usr.inputs.forEach(input => {
            (<AdvancedSpatializerModule> input.dspModule).setRoomCharacter(value);
        });
    }
}
