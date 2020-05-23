"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = __importDefault(require("events"));
const dsp_modules_1 = require("./dsp_modules");
const Logger = __importStar(require("./log"));
const IP = __importStar(require("ip"));
const log = Logger.get('USR');
class User {
    constructor(instance, name) {
        this.htrk = -1;
        this.name = name;
    }
    setInputMuted(iid, muted) {
        let input = this.findInput(iid);
        if (input)
            input.mute = muted;
        else
            return;
        log.info(`Mute status on input ${input.input.name} for user ${this.name} set to ${muted}`);
    }
    setInputAzm(iid, val) {
        let input = this.findInput(iid);
        if (input)
            input.azm = val;
        else
            return;
        input.dspModule.setAzm(val);
        log.info(`Azimuth on input ${input.input.name} for user ${this.name} set to ${val}`);
    }
    setInputElv(iid, val) {
        let input = this.findInput(iid);
        if (input)
            input.elv = val;
        else
            return;
        input.dspModule.setElv(val);
        log.info(`Elevation on input ${input.input.name} for user ${this.name} set to ${val}`);
    }
    setInputStWidth(iid, val) {
        let input = this.findInput(iid);
        if (input)
            input.stwidth = val;
        else
            return;
        input.dspModule.setStWidth(val);
        log.info(`Stereo width on input ${input.input.name} for user ${this.name} set to ${val}`);
    }
    findInput(iid) {
        let input = this.inputs.find(input => input.input.id == iid);
        if (input)
            return input;
        else
            return null
                && log.error('Could not find input ' + iid + ' on user '
                    + this.name);
    }
}
exports.User = User;
class UsersManager extends events_1.default {
    constructor(server, inputs, htrks) {
        super();
        this.users = [];
        this.max_id = 0;
        let self = this;
        this.server = server;
        this.inputs = inputs;
        this.htrks = htrks;
        this.server.on('connection', socket => {
            socket.on('users.update', () => {
                self.updateInterface(socket);
            });
            socket.on('user.add', data => {
                self.addUser(data);
            });
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
    addUser(userdata) {
        let ins = this.inputs.devices.instances.find(ins => ins.instance.id
            == userdata.nodeid);
        let user = new User(ins.instance, userdata.username);
        user.advanced = false;
        user.inputs = [];
        user.id = ++this.max_id;
        user.outputChannels = userdata.channels;
        let nodeAndUsers = this.users.find(n => n.si.id == userdata.nodeid);
        if (nodeAndUsers == undefined)
            this.users.push({ si: ins.instance, users: [] });
        nodeAndUsers = this.users.find(n => n.si.id == userdata.nodeid);
        nodeAndUsers.users.push(user);
        let dspModule = new dsp_modules_1.BasicUserModule(user);
        ins.instance.graph.addModule(dspModule);
        ins.instance.graph.sync();
        this.updateInterface(this.server);
    }
    updateInterface(socket) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("Update Interface");
            let update_users = [];
            let update_aux = [];
            this.users.forEach(node => update_users.push({
                id: node.si.id,
                nodename: node.si.name,
                users: node.users.map(user => {
                    return {
                        id: user.id,
                        advanced: user.advanced,
                        nodename: node.si.name,
                        reflections: user.reflections,
                        roomsize: user.roomsize,
                        room_character: user.room_character,
                        name: user.name,
                        nid: node.si.id,
                        selected_inputs: [],
                        htrk: -1,
                        inputs: user.inputs.map(input => {
                            let obj = {};
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
                    nodename: nodeAndInput.si.name,
                    id: nodeAndInput.si.id,
                    inputs: nodeAndInput.inputs
                });
            });
            let channels = yield this.inputs.devices.getAllChannelLists();
            socket.emit('users.update', { nodes: update_users, inputs: update_aux, channels: channels });
            socket.emit('users.headtrackers.update', this.htrks.trackers.filter(trk => trk.remote.conf).map(trk => trk.remote.id));
        });
    }
    userInputsChanged(data) {
        let usr = this.findUser(data.nid, data.id);
        if (!usr)
            return;
        usr.inputs = usr.inputs.filter(el => {
            let idx = data.inputs.findIndex(inp => inp.id == el.id);
            if (idx == -1) {
                log.info(`Input ${el.input.name} removed from user ${usr.name}`);
                let node = this.inputs.nodes.find(n => n.si.id == data.nid);
                if (el.dspModule) {
                    node.si.graph.removeModule(el.dspModule);
                    node.si.graph.sync();
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
                if (usr.advanced)
                    input_mod = new dsp_modules_1.AdvancedSpatializerModule(dinp, usr);
                else
                    input_mod = new dsp_modules_1.BasicSpatializerModule(dinp, usr);
                node.si.graph.addModule(input_mod);
                node.si.graph.sync();
                log.info(`Added input ${dinp.input.name} added to user ${usr.name}`);
            }
        });
        this.updateInterface(this.server);
    }
    switchSpatializationMode(usr_id, nid) {
        let node = this.users.find(us => us.si.id == nid);
        let usr = node.users.find(us => us.id == usr_id);
        let graph = node.si.graph;
        usr.inputs.forEach(input => {
            graph.removeModule(input.dspModule);
        });
        usr.advanced = !usr.advanced;
        usr.inputs.forEach(input => {
            let new_module;
            if (usr.advanced)
                new_module = new dsp_modules_1.AdvancedSpatializerModule(input, usr);
            else
                new_module = new dsp_modules_1.BasicSpatializerModule(input, usr);
            graph.addModule(new_module);
        });
        graph.sync();
    }
    setInputMuted(usr_id, nid, iid, mute) {
        let usr = this.findUser(nid, usr_id);
        if (usr)
            usr.setInputMuted(iid, mute);
    }
    setInputAzm(usr_id, nid, iid, azm) {
        let usr = this.findUser(nid, usr_id);
        if (usr)
            usr.setInputAzm(iid, azm);
    }
    setInputElv(usr_id, nid, iid, elv) {
        let usr = this.findUser(nid, usr_id);
        if (usr)
            usr.setInputElv(iid, elv);
    }
    setInputStWidth(usr_id, nid, iid, width) {
        let usr = this.findUser(nid, usr_id);
        if (usr)
            usr.setInputStWidth(iid, width);
    }
    findUser(nid, userId) {
        let node = this.users.find(node => node.si.id == nid);
        if (!node)
            return null && log.error('Could not find node for id ' + nid);
        let usr = node.users.find(user => user.id == userId);
        if (!usr)
            return null && log.error('Could not find user with id ' + userId);
        return usr;
    }
    assignHeadtracker(userId, nid, htrkId) {
        let node = this.users.find(n => n.si.id == nid);
        let usr = node.users.find(us => us.id == userId);
        console.log(htrkId);
        usr.htrk = htrkId;
        if (usr.dspModule)
            usr.dspModule.assignHeadtracker(htrkId);
        let trk = this.htrks.trackers.find(htrk => htrk.remote.conf.deviceID() == htrkId);
        if (trk) {
            let trkaddr = trk.remote.conf.device_static_ip;
            let trksubnet = trk.remote.conf.device_static_subnet;
            let trk_net = IP.mask(trkaddr, trksubnet);
            for (let node_addr of node.si.addresses) {
                let node_net = IP.mask(node_addr, trksubnet);
                console.log(`node: ${node_net} trk: ${trk_net}`);
                if (node_net === trk_net)
                    return (trk.setStreamDest(node_addr, 45667));
            }
            log.error('Could not find a matching subnet for node and Headtracker');
        }
        else {
            log.error('Headtracker not found');
        }
    }
    setReflections(usr_id, nid, value) {
        let node = this.users.find(n => n.si.id == nid);
        let usr = node.users.find(us => us.id == usr_id);
        console.log("Reflections: " + value);
        if (!usr.advanced)
            return;
        usr.inputs.forEach(input => {
            input.dspModule.setReflections(value);
        });
    }
    setRoomCharacter(usr_id, nid, value) {
        let node = this.users.find(n => n.si.id == nid);
        let usr = node.users.find(us => us.id == usr_id);
        console.log("Character: " + value);
        if (!usr.advanced)
            return;
        usr.inputs.forEach(input => {
            input.dspModule.setRoomCharacter(value);
        });
    }
}
exports.UsersManager = UsersManager;
//# sourceMappingURL=users.js.map