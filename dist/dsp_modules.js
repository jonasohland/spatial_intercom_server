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
const dsp_1 = require("./dsp");
const Logger = __importStar(require("./log"));
const log = Logger.get('DSP');
function normalizeRads(value) {
    if (value < 0)
        value += 4 * Math.PI;
    return (value + 2 * Math.PI) / 4 * Math.PI;
}
function normalizeDegs(value) {
    return (value + 180) / 360;
}
function normalizeIEMStWidthDegs(value) {
    return (value + 360) / (360 * 2);
}
class BasicSpatializer extends dsp_1.NativeNode {
    constructor(name) {
        super(name, 'basic_spatializer');
        this.addInputBus(dsp_1.Bus.createMainAny(2));
        this.addOutputBus(dsp_1.AmbiBus.createMainForOrder(3, 1));
    }
    remoteAttached() {
        console.log('Remote attached!');
    }
    setAzimuthDeg(value) {
        return __awaiter(this, void 0, void 0, function* () {
            this.remote.set('azimuth', normalizeDegs(value));
        });
    }
    setElevationDeg(value) {
        return __awaiter(this, void 0, void 0, function* () {
            this.remote.set('elevation', normalizeDegs(value));
        });
    }
    setElevation(rad) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.remote.set('elevation', normalizeRads(rad));
        });
    }
    setAzimuth(rad) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.remote.set('azimuth', normalizeRads(rad));
        });
    }
    setStereoWidthDegs(value) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.remote.set('stereo-width', normalizeIEMStWidthDegs(value));
        });
    }
}
exports.BasicSpatializer = BasicSpatializer;
class AdvancedSpatializer extends dsp_1.NativeNode {
    constructor(name) {
        super(name, 'advanced_spatializer');
        this.addInputBus(dsp_1.Bus.createMainAny(1));
        this.addOutputBus(dsp_1.AmbiBus.createMainForOrder(3, 1));
    }
    remoteAttached() {
        console.log('Remote attached!');
    }
    setAzimuthDeg(value) {
        return __awaiter(this, void 0, void 0, function* () {
            this.remote.set('azimuth', normalizeDegs(value));
        });
    }
    setElevationDeg(value) {
        return __awaiter(this, void 0, void 0, function* () {
            this.remote.set('elevation', normalizeDegs(value));
        });
    }
    setElevation(rad) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.remote.set('elevation', normalizeRads(rad));
        });
    }
    setAzimuth(rad) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.remote.set('azimuth', normalizeRads(rad));
        });
    }
    setStereoWidthDegs(value) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.remote.set('stereo-width', normalizeIEMStWidthDegs(value));
        });
    }
}
exports.AdvancedSpatializer = AdvancedSpatializer;
class BasicBinauralDecoder extends dsp_1.NativeNode {
    constructor(name) {
        super(name, 'basic_binaural_decoder');
        this.addInputBus(dsp_1.AmbiBus.createMainForOrder(3, 1));
        this.addOutputBus(dsp_1.Bus.createMainStereo(1));
    }
    remoteAttached() { }
}
exports.BasicBinauralDecoder = BasicBinauralDecoder;
class AdvancedBinauralDecoder extends dsp_1.NativeNode {
    constructor(name) {
        super(name, 'advanced_binaural_decoder');
        this.addInputBus(dsp_1.AmbiBus.createMainForOrder(3, 1));
        this.addOutputBus(dsp_1.Bus.createMainStereo(1));
    }
    remoteAttached() { }
    setHeadtrackerId(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.remote.set('headtracker-id', id);
        });
    }
    getHeadtrackerId() {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.remote.request('headtracker-id')).data;
        });
    }
}
exports.AdvancedBinauralDecoder = AdvancedBinauralDecoder;
class SpatializationModule extends dsp_1.Module {
}
exports.SpatializationModule = SpatializationModule;
class BasicSpatializerModule extends SpatializationModule {
    constructor(input, user) {
        super();
        this.encoder_nid = -1;
        this.id = -1;
        this.owned_input = input;
        this.user = user;
    }
    setAzm(azm) {
        if (this.processor)
            this.processor.setAzimuthDeg(azm);
    }
    setElv(elv) {
        if (this.processor)
            this.processor.setElevationDeg(elv);
    }
    setStWidth(stwidth) {
        if (this.processor)
            this.processor.setStereoWidthDegs(stwidth);
    }
    getProcessor() {
        return this.processor;
    }
    destroy(graph) {
        log.info(`Destroying spatializer module for Input ${this.owned_input.input.name} `);
        graph.removeNode(this.encoder_nid);
    }
    input(graph) {
        return graph.getNode(this.encoder_nid).mainIn();
    }
    output(graph) {
        return graph.getNode(this.encoder_nid).mainOut();
    }
    graphChanged(graph) { }
    build(graph) {
        let node = new BasicSpatializer(this.owned_input.input.name + ' -> '
            + this.user.name);
        this.processor = node;
        graph.addNode(node);
        this.encoder_nid = node.id;
        this.owned_input.dspModule = this;
        let start_ch = this.owned_input.input.channels[0].i;
        if (this.owned_input.format == 'mono') {
            this.inputConn
                = graph.mainInBus().connectIdxN(node.mainIn(), start_ch, 1);
        }
        else {
            this.inputConn
                = graph.mainInBus().connectIdxN(node.mainIn(), start_ch, 2);
        }
        graph.addConnection(this.inputConn);
    }
}
exports.BasicSpatializerModule = BasicSpatializerModule;
class AdvancedSpatializerModule extends SpatializationModule {
    constructor(input, user) {
        super();
        this.encoder_l_nid = -1;
        this.encoder_r_nid = -1;
        this.id = -1;
        this.cachedElv = 0;
        this.cachedAzm = 0;
        this.cachedStWidth = 0;
        this.owned_input = input;
        this.user = user;
    }
    setAzm(azm) {
        this.cachedAzm = (azm / 360) * 2 * Math.PI;
        this.sendPosData();
    }
    setElv(elv) {
        this.cachedElv = (elv / 360) * 2 * Math.PI;
        this.sendPosData();
    }
    setStWidth(stwidth) {
        this.cachedStWidth = (stwidth / 360) * 2 * Math.PI;
        this.sendPosData();
    }
    setReflections(reflections) {
        if (this.processorR) {
            this.processorL.remote.set('reflections', 0);
            this.processorR.remote.set('reflections', 0);
        }
        else
            this.processorL.remote.set('reflections', reflections);
    }
    setRoomCharacter(character) {
        this.processorL.remote.set('room_character', character);
        if (this.processorR)
            this.processorR.remote.set('room_character', character);
    }
    destroy(graph) {
        log.info(`Destroying _advanced_ spatializer module for Input ${this.owned_input.input.name} `);
        graph.removeNode(this.encoder_l_nid);
        if (this.encoder_r_nid != -1)
            graph.removeNode(this.encoder_r_nid);
    }
    input(graph) {
        return graph.getNode(this.encoder_l_nid).mainIn();
    }
    output(graph) {
        return graph.getNode(this.encoder_l_nid).mainOut();
    }
    graphChanged(graph) { }
    build(graph) {
        this.owned_input.dspModule = this;
        let start_ch = this.owned_input.input.channels[0].i;
        let node = new AdvancedSpatializer(this.owned_input.input.name
            + '_L -> ' + this.user.name + '');
        this.processorL = node;
        graph.addNode(node);
        this.encoder_l_nid = node.id;
        this.inputConnL
            = graph.mainInBus().connectIdxN(node.mainIn(), start_ch, 1);
        graph.addConnection(this.inputConnL);
        if (this.owned_input.format == 'stereo') {
            let rnode = new AdvancedSpatializer(this.owned_input.input.name
                + '_R -> ' + this.user.name);
            this.processorR = rnode;
            graph.addNode(rnode);
            this.encoder_r_nid = rnode.id;
            this.inputConnR = graph.mainInBus().connectIdxN(rnode.mainIn(), start_ch + 1, 1);
            graph.addConnection(this.inputConnR);
        }
    }
    sendPosData() {
        let azmL = (this.owned_input.format == 'stereo')
            ? this.cachedAzm - (this.cachedStWidth / 2)
            : this.cachedAzm;
        let X = Math.cos(azmL) * Math.cos(this.cachedElv) * 0.15 + 0.5;
        let Y = Math.sin(azmL) * Math.cos(this.cachedElv) * 0.15 + 0.5;
        let Z = Math.sin(this.cachedElv) * 0.15 + 0.5;
        console.log(X, Y, Z);
        this.processorL.remote.set('xyz', { x: X, y: Y, z: Z });
        if (this.processorR) {
            let azmR = this.cachedAzm + (this.cachedStWidth / 2);
            let X2 = Math.cos(azmR) * Math.cos(this.cachedElv) * 0.15 + 0.5;
            let Y2 = Math.sin(azmR) * Math.cos(this.cachedElv) * 0.15 + 0.5;
            let Z2 = Math.sin(this.cachedElv) * 0.15 + 0.5;
            this.processorR.remote.set('xyz', { x: X2, y: Y2, z: Z2 });
        }
    }
}
exports.AdvancedSpatializerModule = AdvancedSpatializerModule;
class BasicUserModule extends dsp_1.Module {
    constructor(user) {
        super();
        this.decoder_nid = -1;
        this.id = -1;
        this.inputCons = [];
        this.user = user;
    }
    input(graph) {
        return graph.getNode(this.decoder_nid).mainIn();
    }
    output(graph) {
        return graph.getNode(this.decoder_nid).mainOut();
    }
    assignHeadtracker(id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.node)
                return this.node.setHeadtrackerId(id);
        });
    }
    graphChanged(graph) {
        this.inputCons = this.inputCons.filter(con => con.valid());
        this.user.inputs.forEach(input => {
            if (!graph.hasModule(input.dspModule))
                return;
            if (this.user.advanced) {
                console.log(`Checking input ${input.input.name} - nid: ${input.dspModule
                    .encoder_l_nid}`);
                if (this.inputCons.find(con => con.sources.length
                    && (con.sources[0].n
                        == input
                            .dspModule
                            .encoder_l_nid)))
                    return;
                if (input.format == 'stereo') {
                    if (this.inputCons.find(con => con.sources.length
                        && (con.sources[0].n
                            == input
                                .dspModule
                                .encoder_r_nid)))
                        return;
                }
                let conL = input.dspModule
                    .processorL.mainOut()
                    .connect(this.input(graph));
                this.inputCons.push(conL);
                graph.addConnection(conL);
                if (input.format == 'stereo') {
                    let conR = input.dspModule
                        .processorR.mainOut()
                        .connect(this.input(graph));
                    this.inputCons.push(conR);
                    graph.addConnection(conR);
                }
            }
            else {
                console.log(`Checking input ${input.input.name} - nid: ${input.dspModule.encoder_nid}`);
                if (input.dspModule) {
                    console.log(this.decoder_nid);
                    if (this.inputCons.find(con => con.sources.length
                        && (con.sources[0].n
                            == input
                                .dspModule
                                .encoder_nid)))
                        return;
                    console.log('Adding inputs for Module ' + input.input.name);
                    let con = input.dspModule.output(graph).connect(this.input(graph));
                    this.inputCons.push(con);
                    graph.addConnection(con);
                }
            }
        });
    }
    build(graph) {
        let node = new AdvancedBinauralDecoder(this.user.name);
        graph.addNode(node);
        this.node = node;
        this.graph = graph;
        this.user.dspModule = this;
        this.outputConn = node.mainOut().connectIdxNIdx(graph.mainOutBus(), 0, 2, this.user.outputChannels[0].i);
        this.decoder_nid = node.id;
        graph.addConnection(this.outputConn);
    }
    destroy(graph) {
        graph.removeNode(this.decoder_nid);
    }
}
exports.BasicUserModule = BasicUserModule;
//# sourceMappingURL=dsp_modules.js.map