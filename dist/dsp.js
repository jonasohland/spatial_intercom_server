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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const Logger = __importStar(require("./log"));
const log = Logger.get('DSP');
function _portarr_chcount(ports) {
    return ports.reduce((count, port) => { return count + port.c; }, 0);
}
var PortTypes;
(function (PortTypes) {
    PortTypes[PortTypes["Any"] = 0] = "Any";
    PortTypes[PortTypes["Mono"] = 1] = "Mono";
    PortTypes[PortTypes["Stereo"] = 2] = "Stereo";
    PortTypes[PortTypes["Quad"] = 3] = "Quad";
    PortTypes[PortTypes["Surround_5_1"] = 4] = "Surround_5_1";
    PortTypes[PortTypes["Surround_7_1"] = 5] = "Surround_7_1";
    PortTypes[PortTypes["Surround_10_2"] = 6] = "Surround_10_2";
    PortTypes[PortTypes["Surround_11_1"] = 7] = "Surround_11_1";
    PortTypes[PortTypes["Surround_22_2"] = 8] = "Surround_22_2";
    PortTypes[PortTypes["x3D_5_4_1"] = 9] = "x3D_5_4_1";
    PortTypes[PortTypes["x3D_7_4_1"] = 10] = "x3D_7_4_1";
    PortTypes[PortTypes["x3D_4_0_4"] = 11] = "x3D_4_0_4";
    PortTypes[PortTypes["Ambi_O0"] = 12] = "Ambi_O0";
    PortTypes[PortTypes["Ambi_O1"] = 13] = "Ambi_O1";
    PortTypes[PortTypes["Ambi_O2"] = 14] = "Ambi_O2";
    PortTypes[PortTypes["Ambi_O3"] = 15] = "Ambi_O3";
    PortTypes[PortTypes["Ambi_O4"] = 16] = "Ambi_O4";
    PortTypes[PortTypes["Ambi_O5"] = 17] = "Ambi_O5";
    PortTypes[PortTypes["Ambi_O6"] = 18] = "Ambi_O6";
    PortTypes[PortTypes["Ambi_O7"] = 19] = "Ambi_O7";
    PortTypes[PortTypes["Ambi_O8"] = 20] = "Ambi_O8";
    PortTypes[PortTypes["Ambi_O9"] = 21] = "Ambi_O9";
    PortTypes[PortTypes["Ambi_O10"] = 22] = "Ambi_O10";
    PortTypes[PortTypes["Ambi_O11"] = 23] = "Ambi_O11";
})(PortTypes = exports.PortTypes || (exports.PortTypes = {}));
function stringToPortType(str) {
    switch (str.toLocaleLowerCase()) {
        case 'mono': return PortTypes.Mono;
        case 'st': return PortTypes.Stereo;
        case 'stereo': return PortTypes.Stereo;
        case 'surround': return PortTypes.Surround_5_1;
        case '5.1': return PortTypes.Surround_5_1;
        case '5_1': return PortTypes.Surround_5_1;
        default: return PortTypes.Any;
    }
}
exports.stringToPortType = stringToPortType;
exports.PortTypeChannelCount = [
    1,
    1,
    2,
    4,
    6,
    8,
    12,
    12,
    24,
    10,
    12,
    8,
    1,
    4,
    9,
    16,
    25,
    36,
    49,
    64,
    81,
    100,
    121,
    144 // Ambi O11
];
class AmbisonicsProperties {
}
exports.AmbisonicsProperties = AmbisonicsProperties;
/**
 * Base class for an Input/Output of a node
 */
class Port {
    constructor(name, type) {
        this.i = -1;
        this.ni = -1;
        this.n = -1;
        /**
         * Total number of channels per port
         */
        this.c = 1;
        this.type = type;
        this.name = name;
        this.c = exports.PortTypeChannelCount[type];
    }
    isAmbiPort() {
        return this instanceof AmbiPort;
    }
}
exports.Port = Port;
class Connection {
    constructor(sources, destinations) {
        this.sources = [];
        this.destinations = [];
        this.sources = sources;
        this.destinations = destinations;
    }
    repair() {
        this.sources = this.sources.filter(p => p.n != -1);
        this.destinations = this.destinations.filter(p => p.n != -1);
        while (this.destChannelCount() > this.srcChannelCount())
            this.destinations.pop();
        return this.srcChannelCount() == this.destChannelCount();
    }
    valid() {
        return this.srcChannelCount() == this.destChannelCount()
            && this.sources.filter(p => p.n != -1).length
            && this.destinations.filter(p => p.n != -1).length;
    }
    channelCount() {
        if (!this.valid())
            throw Error('Invalid connection');
        return this.srcChannelCount();
    }
    destChannelCount() {
        return this._channel_count(false);
    }
    srcChannelCount() {
        return this._channel_count(true);
    }
    _channel_count(src) {
        let count = 0;
        for (let port of src ? this.sources : this.destinations)
            count += port.c;
        return count;
    }
}
exports.Connection = Connection;
class Bus {
    constructor(name, type) {
        this.ports = [];
        this.name = name;
        this.type = type;
    }
    channelCount() {
        let count = 0;
        for (let port of this.ports)
            count += port.c;
        return count;
    }
    portCount() {
        return this.ports.length;
    }
    connect(other) {
        return this.connectIdxNIdx(other, 0, 1, 0);
    }
    connectIdx(other, thisIndex) {
        return this.connectIdxNIdx(other, thisIndex, 1, 0);
    }
    connectIdxN(other, thisIndex, thisCount) {
        return this.connectIdxNIdx(other, thisIndex, thisCount, 0);
    }
    connectIdxIdx(other, thisIndex, otherIndex) {
        return this.connectIdxNIdx(other, thisIndex, 1, otherIndex);
    }
    connectIdxNIdx(other, thisIndex, thisCount, otherIndex) {
        let sources = [];
        let destinations = [];
        sources = this.ports.slice(thisIndex, thisIndex + thisCount);
        let requested_chcount = _portarr_chcount(sources);
        let other_chcount = 0;
        let i = otherIndex;
        do {
            let cport = other.ports[i];
            other_chcount += cport.c;
            destinations.push(cport);
        } while (other.ports.length > ++i && other_chcount < requested_chcount
            && other_chcount);
        if (other_chcount == requested_chcount)
            return new Connection(sources, destinations);
    }
    _set_start_idx(idx) {
        for (let i in this.ports) {
            this.ports[i].ni
                = idx + (Number.parseInt(i) * exports.PortTypeChannelCount[this.type]);
        }
    }
    _set_nodeid(id) {
        this.ports.forEach(p => p.n = id);
    }
    static _with_ports(count, bus, type) {
        for (let i = 0; i < count; ++i) {
            let port = new Port(`${bus.name} ${i + 1} (${PortTypes[bus.type]})`, type);
            port.i = i;
            bus.ports.push(port);
        }
        return bus;
    }
    static createAny(name, count) {
        return Bus._with_ports(count, new Bus(name, PortTypes.Any), PortTypes.Any);
    }
    static createMono(name, count) {
        return Bus._with_ports(count, new Bus(name, PortTypes.Mono), PortTypes.Mono);
    }
    static createStereo(name, count) {
        return Bus._with_ports(count, new Bus(name, PortTypes.Stereo), PortTypes.Stereo);
    }
    static create(name, count, type) {
        return Bus._with_ports(count, new Bus(name, type), type);
    }
    static createMain(count, type) {
        return Bus._with_ports(count, new Bus('main', type), type);
    }
    static createMainAny(count) {
        return Bus.createMain(count, PortTypes.Any);
    }
    static createMainMono(count) {
        return Bus.createMain(count, PortTypes.Mono);
    }
    static createMainStereo(count) {
        return Bus.createMain(count, PortTypes.Stereo);
    }
}
exports.Bus = Bus;
class AmbiBus extends Bus {
    static createForOrder(name, order, count) {
        return Bus.create(name, count, PortTypes.Ambi_O0 + order);
    }
    static createMainForOrder(order, count) {
        return AmbiBus.createForOrder('main', order, count);
    }
}
exports.AmbiBus = AmbiBus;
class AmbiPort extends Port {
}
exports.AmbiPort = AmbiPort;
class BusProxy {
    main() {
        return this.buses.find(b => b.name == 'main');
    }
}
exports.BusProxy = BusProxy;
class Node extends events_1.EventEmitter {
    constructor(name, type) {
        super();
        this.id = -1;
        this.inputs = [];
        this.outputs = [];
        this.sends = [];
        this.receives = [];
        this.name = name;
        this.type = type;
    }
    addBus(input, bus) {
        bus._set_start_idx(this.channelCount(input));
        if (input)
            this.inputs.push(bus);
        else
            this.outputs.push(bus);
        return this;
    }
    mainIn() {
        return this.getMainBus(true);
    }
    mainOut() {
        return this.getMainBus(false);
    }
    getMainBus(input) {
        return this.getBus(input, 'main');
    }
    getInputBus(name) {
        this.getBus(true, name);
    }
    getOutputBus(name) {
        return this.getBus(false, name);
    }
    getBus(input, name) {
        if (input)
            return this.inputs.find(bus => bus.name == name);
        else
            return this.outputs.find(bus => bus.name == name);
    }
    addInputBus(bus) {
        return this.addBus(true, bus);
    }
    addOutputBus(bus) {
        return this.addBus(false, bus);
    }
    channelCount(input) {
        let count = 0;
        for (let bus of (input) ? this.inputs : this.outputs)
            count += bus.channelCount();
        return count;
    }
    outputChannelCount() {
        return this.channelCount(false);
    }
    inputChannelCount() {
        return this.channelCount(true);
    }
    _remove_invalid_connections() {
        this.sends = this.sends.filter(con => con.repair());
        this.receives = this.receives.filter(con => con.repair());
    }
    _set_nodeid(id) {
        this.id = id;
        this.outputs.forEach(b => b._set_nodeid(id));
        this.inputs.forEach(b => b._set_nodeid(id));
    }
    _unset_nodeid(autoremove = false) {
        this.id = -1;
        this.outputs.forEach(b => b._set_nodeid(-1));
        this.inputs.forEach(b => b._set_nodeid(-1));
        if (autoremove)
            this._remove_invalid_connections();
    }
}
exports.Node = Node;
class InputNode extends Node {
    constructor(name) {
        super(name, '__input');
    }
}
exports.InputNode = InputNode;
class OutputNode extends Node {
    constructor(name) {
        super(name, '__output');
    }
}
exports.OutputNode = OutputNode;
class PluginNode extends Node {
    constructor(name) {
        super(name, 'vst_processor');
    }
}
exports.PluginNode = PluginNode;
class NativeNode extends Node {
    constructor(name, native_node_type) {
        super(name, 'native_processor');
        this.processor_type = native_node_type;
    }
    attachEventListener(con) {
        this.connection = con;
        this.native_event_name = `${this.processor_type}_${this.id}`;
        this.remote = this.connection.getRequester(this.native_event_name);
        this.remoteAttached();
    }
}
exports.NativeNode = NativeNode;
class Module {
}
exports.Module = Module;
class Graph {
    constructor(process) {
        this.nodes = [];
        this.connections = [];
        this.modules = [];
        this.node_count = 1;
        this.process = process;
        this.remote = this.process.getRequester('graph');
        let self = this;
        this.process.on('connection', () => {
            self.remote.request('reset').catch(err => log.error(err));
        });
    }
    addNode(node) {
        let node_id = this.node_count;
        ++this.node_count;
        node._set_nodeid(node_id);
        this.nodes.push(node);
        if (node instanceof NativeNode)
            node.attachEventListener(this.process);
        return node_id;
    }
    addConnection(connection) {
        this.connections.push(connection);
        let self = this;
        self.getNode(connection.sources[0].n).sends.push(connection);
        self.getNode(connection.destinations[0].n).receives.push(connection);
    }
    removeNode(node) {
        let rmv_node;
        if (node instanceof Node)
            rmv_node = this.nodes.splice(this.nodes.indexOf(node))[0];
        else if (typeof node == 'number')
            rmv_node = this.nodes.splice(this.nodes.findIndex(n => n.id === node), 1)[0];
        if (rmv_node)
            rmv_node._unset_nodeid(true);
        this.fix();
        return rmv_node;
    }
    fix() {
        this.connections = this.connections.filter(c => c.repair());
        this.nodes.forEach(n => n._remove_invalid_connections());
        this.modules.forEach(mod => mod.graphChanged(this));
    }
    getNode(nodeId) {
        return this.nodes.find(n => n.id == nodeId);
    }
    setInputNode(count) {
        this.addNode(new InputNode('graph_input')
            .addOutputBus(Bus.createMainAny(count)));
    }
    setOutputNode(count) {
        this.addNode(new OutputNode('graph_output')
            .addInputBus(Bus.createMainAny(count)));
    }
    getInputNode() {
        return this.nodes.find(n => n.type == '__input');
    }
    getOutputNode() {
        return this.nodes.find(n => n.type == '__output');
    }
    mainInBus() {
        return this.getInputNode().mainOut();
    }
    mainOutBus() {
        return this.getOutputNode().mainIn();
    }
    addModule(mod) {
        ++this.node_count;
        mod.build(this);
        mod.id = this.node_count;
        mod.graph = this;
        this.modules.push(mod);
        this.rebuild();
    }
    hasModule(mod) {
        return this.modules.indexOf(mod) != -1;
    }
    removeModule(mod) {
        let mod_idx = this.modules.indexOf(mod);
        if (mod_idx == -1)
            return null && log.error("Could not find Module to remove");
        let removed = this.modules.splice(mod_idx, 1)[0];
        if (removed)
            removed.destroy(this);
        return removed;
    }
    sync() {
        return __awaiter(this, void 0, void 0, function* () {
            let self = this;
            return new Promise((resolve, reject) => {
                log.info('Syncing graph with DSP process');
                self.remote.request('set', this._export())
                    .then(() => {
                    log.info('Done Syncing');
                    resolve();
                })
                    .catch(err => {
                    log.error('Could not sync graph: ' + err.message);
                    reject();
                });
            });
        });
    }
    rebuild() {
        this.modules.forEach(mod => mod.graphChanged(this));
    }
    _export() {
        let out = {
            nodes: this.nodes.map(n => {
                let obj = {};
                obj.ins_count = n.mainIn() ? n.mainIn().channelCount() : 0;
                obj.outs_count = n.mainOut() ? n.mainOut().channelCount() : 0;
                obj.id = n.id;
                obj.type = n.type;
                obj.name = n.name;
                obj.processor_type = n.processor_type;
                return obj;
            }),
            connections: this.connections
        };
        return out;
    }
}
exports.Graph = Graph;
//# sourceMappingURL=dsp.js.map