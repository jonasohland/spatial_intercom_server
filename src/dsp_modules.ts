import { PortTypes, SourceUtils, SourceParameterSet, Source, isAmbi} from './dsp_defs';
import {
    AmbiBus,
    Bus,
    Connection,
    Graph,
    Module,
    NativeNode,
    Port,
} from './dsp_graph'
import {GraphBuilderOutputEvents} from './dsp_graph_builder';
import * as Logger from './log';
import {SpatializedInput, User} from './users';
import {UserData} from './users_defs';
import { ignore } from './util';
import { RoomData } from './rooms_defs';
import { Room } from './rooms';

const log = Logger.get('DSPMOD');

function normalizeRads(value: number)
{
    if (value < 0)
        value += 4 * Math.PI;

    return (value + 2 * Math.PI) / 4 * Math.PI;
}

function normalizeDegs(value: number)
{
    return (value + 180) / 360;
}

function normalizeIEMStWidthDegs(value: number)
{
    return (value + 360) / (360 * 2);
}


export class GainNode extends NativeNode {

    _remote_alive: boolean = false;
    _gain: number = 0;

    constructor(name: string, ty: PortTypes)
    {
        super(name, "gain_node");
        this.addInputBus(Bus.createMain(1, ty));
        this.addOutputBus(Bus.createMain(1, ty));
    }

    setGain(gain: number) 
    {
        this._gain = gain;
        if(this._remote_alive)
            this.remote.set('gain', this._gain);
    }

    onRemotePrepared(): void {
        this._remote_alive = true;
        this.remote.set('gain', this._gain).catch(err => log.error(`Could not set gain for gain-node ${err}`));
    }
    onRemoteAlive(): void {

    }
    remoteAttached(): void {

    }
}

export class BasicSpatializer extends NativeNode {
    onRemotePrepared(): void 
    {
    }
    onRemoteAlive(): void
    {
    }

    constructor(name: string)
    {
        super(name, 'basic_spatializer');
        this.addInputBus(Bus.createMainAny(2));
        this.addOutputBus(AmbiBus.createMainForOrder(3, 1));
    }

    remoteAttached(): void
    {
    }

    async setAzimuthDeg(value: number)
    {
        this.remote.set('azimuth', normalizeDegs(value));
    }

    async setElevationDeg(value: number)
    {
        this.remote.set('elevation', normalizeDegs(value));
    }

    async setElevation(rad: number)
    {
        return this.remote.set('elevation', normalizeRads(rad));
    }

    async setAzimuth(rad: number)
    {
        return this.remote.set('azimuth', normalizeRads(rad));
    }

    async setStereoWidthDegs(value: number)
    {
        return this.remote.set('stereo-width', normalizeIEMStWidthDegs(value));
    }
}

export class BasicBinauralDecoder extends NativeNode {
    onRemotePrepared(): void 
    {
    }
    onRemoteAlive(): void
    {
    }

    constructor(name: string, order: number)
    {
        super(name, 'basic_binaural_decoder');
        this.addInputBus(AmbiBus.createMainForOrder(order, 1));
        this.addOutputBus(Bus.createMainStereo(1));
    }

    remoteAttached()
    {
    }
}

export class AdvancedBinauralDecoder extends NativeNode {

    _htrk_id: number = -1;

    onRemotePrepared(): void {
    }

    onRemoteAlive(): void
    {
        if(this._htrk_id != -1) {
            this.setHeadtrackerId(this._htrk_id).catch(err => {
                log.error("Could not set headtracker id");
            })
        }
        this.remote.set('mute', false);
    }

    constructor(name: string, order: number, headtracker_id: number)
    {
        super(name, 'advanced_binaural_decoder');
        this.addInputBus(AmbiBus.createMainForOrder(order, 1));
        this.addOutputBus(Bus.createMainStereo(1));
        this._htrk_id = headtracker_id;
    }

    remoteAttached()
    {
    }

    async setHeadtrackerId(id: number)
    {
        this._htrk_id = id;
        if (this._htrk_id != -1)
            return this.remote.set('headtracker-id', id);
    }

    async getHeadtrackerId()
    {
        return <number>(await this.remote.request('headtracker-id')).data;
    }
}

export class BasicSpatializerModule {

    encoder_nid: number = -1;
    id: number          = -1;
    inputConn: Connection;
    outputConn: Connection;
    processor: BasicSpatializer;

    setAzm(azm: number): void
    {
        if (this.processor)
            this.processor.setAzimuthDeg(azm);
    }

    setElv(elv: number): void
    {
        if (this.processor)
            this.processor.setElevationDeg(elv);
    }

    setStWidth(stwidth: number): void
    {
        if (this.processor)
            this.processor.setStereoWidthDegs(stwidth);
    }

    getProcessor()
    {
        return this.processor;
    }

    destroy(graph: Graph)
    {
        graph.removeNode(this.encoder_nid);
    }

    input(graph: Graph): Bus
    {
        return graph.getNode(this.encoder_nid).getMainInputBus();
    }

    output(graph: Graph): Bus
    {
        return graph.getNode(this.encoder_nid).getMainOutputBus();
    }

    graphChanged(graph: Graph): void
    {
    }

    build(graph: Graph): void
    {
    }
}

export abstract class SpatializationModule extends Module {
    abstract pan(params: SourceParameterSet) : void;
    abstract setAzimuth(a: number): void;
    abstract setElevation(e: number): void;
    abstract setHeight(h: number): void;
    abstract setWidth(w: number): void;
    abstract setGain(gain: number): void; 
    abstract userId(): string;
    abstract outputBuses(graph: Graph): Bus[];
    abstract monoRefBuses(): Bus[];
    abstract stereoRefBuses(): Bus[];
}

export class MultiSpatializer extends NativeNode {


    _chtype: PortTypes;
    _chcount: number;
    _params: SourceParameterSet;
    _mute: boolean = false;
    _gain: number = 0.;

    _stereoref: Bus;
    _monoref: Bus;

    stereoRefBus()
    {
        return this._stereoref;
    }

    monoRefBus()
    {
        return this._monoref;
    }

    setElevation(elevation: number)
    {
        this._params.e = elevation;
        if(this.remote)
            this._apply_sources().catch(err => {});
    }

    setAzimuth(azimuth: number)
    {
        this._params.a = azimuth;
        if(this.remote)
            this._apply_sources().catch(err => {});
    }

    setGain(gain: number) {
        this._gain = gain;
        if(this.remote)
            this._apply_gain().catch(err => log.error(`Could not apply gain: ${err}`));
    }

    pan(params: SourceParameterSet)
    {
        this._params = params;
        if(this.remote)
            this._apply_sources().catch(err => {});
    }

    onRemoteAlive()
    {
        
    }

    onRemotePrepared(): void {
        log.info('MultiSpatializer remote prepared');
        this._apply_all_parameters().catch(err => {
            log.error("Could not apply all parameters for Spatializer " + this.id + " " + err);        
        });
    }

    remoteAttached()
    {
    }

    async mute()
    {
        this.remote.set('mute', true);
    }

    async unmute()
    {
        this.remote.set('mute', false);
    }

    async _apply_all_parameters() 
    {
        await this.remote.set('mute', this._mute);
        await this.remote.set('gain', this._gain);
        return this._apply_sources();
    }

    async _apply_sources()
    {
        return this.remote.set('sources', SourceUtils[this._chtype].pan(this._params));
    }

    async _apply_gain() 
    {
        return this.remote.set('gain', this._gain);
    }

    constructor(name: string, type: PortTypes)
    {
        super(name, 'multi_spatializer');
        this._chtype = type;
        this._chcount = SourceUtils[type].channels;
        this.addInputBus(Bus.createMain(1, type));
        this.addOutputBus(Bus.createMain(1, PortTypes.Ambi_O3));
        this._stereoref = Bus.createStereo('stereoref', 1);
        this._monoref = Bus.createMono('monoref', 1);
        this.addOutputBus(this._stereoref);
        this.addOutputBus(this._monoref);
        this._params = SourceUtils[type].defaults();
        this._params.e = -10;
    }
}

export class RoomSpatializer extends NativeNode {

    _cached_source: Source;
    _remote_alive: boolean = false;
    _roomdata: RoomData;
    _gain = 0;

    _monoref: Bus;
    _stereoref: Bus;

    constructor(name: string)
    {
        super(name, 'advanced_spatializer');
        this.addInputBus(Bus.createMainAny(1));
        this.addOutputBus(AmbiBus.createMainForOrder(3, 1));
        this._monoref = Bus.createMono('monoref', 1);
        this._stereoref = Bus.createStereo('stereoref', 1);
        this.addOutputBus(this._stereoref);
        this.addOutputBus(this._monoref);
    }

    stereoRefBus()
    {
        return this._stereoref;
    }

    monoRefBus()
    {
        return this._monoref;
    }

    remoteAttached(): void
    {
    }

    onRemoteAlive(): void
    {
    }

    onRemotePrepared(): void 
    {
        this._remote_alive = true;
        this.panSource(this._cached_source);
        this._set_roomdata().catch(err => log.error("Could not set roomdata " + err));
        this.remote.set('gain', this._gain).catch(err => log.error("Could not set gain " + err));
    }

    panSource(source: Source)
    {
        this._cached_source = source;
        this._setxyz(source.a, source.e);
    }

    setGain(gain: number) {
        this._gain = gain;
        if(this._remote_alive) 
            this.remote.set('gain', this._gain);
    }

    setRoomData(room: RoomData)
    {
        this._roomdata = room;
        this._set_roomdata().catch(err => log.error("Could not set roomdata " + err));
    }

    setRoomEnabled(room: RoomData) 
    {
        this._roomdata = room;
        if(this._remote_alive) {
            if(this._roomdata.enabled)
                this.remote.set('reflections', this._roomdata.reflections);
            else
                this.remote.set('reflections', 0.);
        }
    }

    setRoomReflections(room: RoomData) 
    {
        this.setRoomEnabled(room);
    }

    setRoomAttn(room: RoomData) 
    {
        this._roomdata = room;
        if(this._remote_alive)
            this.remote.set('attn', this._roomdata.attn);
    }

    setRoomShape(room: RoomData) 
    {
        this._roomdata = room;
        if(this._remote_alive)
            this.remote.set('shape', this._roomdata.room);
    }

    setRoomHighshelf(room: RoomData) 
    {
        this._roomdata = room;
        if(this._remote_alive)
            this.remote.set('highshelf', this._roomdata.eq.high);
    }

    setRoomLowshelf(room: RoomData) 
    {
        this._roomdata = room;
        if(this._remote_alive)
            this.remote.set('lowshelf', this._roomdata.eq.low);
    }

    async _set_roomdata() {
        if(this.remote) {
            await this.remote.set('shape', this._roomdata.room);
            await this.remote.set('highshelf', this._roomdata.eq.high);
            await this.remote.set('lowshelf', this._roomdata.eq.low);
            await this.remote.set('attn', this._roomdata.attn);
            
            if(this._roomdata.enabled)
                await this.remote.set('reflections', this._roomdata.reflections);
            else
                await this.remote.set('reflections', 0.);
        }
    }

    async _setxyz(a: number, e: number)
    {
        let a_rad = a * -1 * Math.PI / 180;
        let e_rad = e * Math.PI / 180;
        if(this._remote_alive) {
            let x = Math.cos(a_rad) * Math.cos(e_rad) * 0.15 + 0.5;
            let y = Math.sin(a_rad) * Math.cos(e_rad) * 0.15 + 0.5;
            let z = Math.sin(e_rad) * 0.15 + 0.5;
            return this.remote.set('xyz', { x, y, z, a });
        }
    }
}

export class SimpleUsersModule extends Module {

    _usr: User;
    _decoder_id: number;
    _decoder: AdvancedBinauralDecoder;

    constructor(user: User)
    {
        super();
        this._usr = user;
    }

    input(graph: Graph): Bus
    {
        return graph.getNode(this._decoder_id).getMainInputBus();
    }

    output(graph: Graph): Bus
    {
        return graph.getNode(this._decoder_id).getMainOutputBus();
    }

    graphChanged(graph: Graph): void
    {
    }

    setHeadtrackerId(id: number)
    {
        this._decoder
    }

    build(graph: Graph): void
    {

        this._decoder         = new AdvancedBinauralDecoder(this._usr.get().name, 3, this._usr.get().headtracker || -1);
        this._decoder_id = graph.addNode(this._decoder);

        let spatializers = <SpatializationModule[]>graph.modules.filter(
            module => module instanceof SpatializationModule);
        let my_spatializers = spatializers.filter(sp => sp.userId()
                                                        === this._usr.get().id);

        let output_start = this._usr.get().channel;

        my_spatializers.forEach(spatializer => {
            spatializer.outputBuses(graph).forEach(bus => {
                let con = bus.connect(this._decoder.getMainInputBus());
                if(con)
                    graph.addConnection(con);
            });

            spatializer.stereoRefBuses().forEach(bus => {
                let con = bus.connectOtherIdx(graph.graphExitBus(), output_start + 2);
                if(con)
                    graph.addConnection(con);
            });

            spatializer.monoRefBuses().forEach(bus => {
                let con = bus.connectOtherIdx(graph.graphExitBus(), output_start + 4);
                if(con)
                    graph.addConnection(con);
            })
        });

        let output_con = this._decoder.getMainOutputBus().connectOtherIdx(
            graph.graphExitBus(), this._usr.get().channel);

        

        graph.addConnection(output_con);
    }

    destroy(graph: Graph): void
    {
        if (graph.removeNode(this._decoder_id))
            log.debug(
                `Removed decoder module for user ${this._usr.get().name}`);
        else
            log.warn(`Could not remove decoder module for user ${
                this._usr.get().name}`);
    }
}

export class RoomSpatializerModule extends SpatializationModule {

    _input: SpatializedInput;
    _encoder_nids: number[] = [];
    _encoders: RoomSpatializer[] = [];
    _gain_node: GainNode;
    _gain: number;
    _cached_params: SourceParameterSet;
    _roomdata: RoomData;

    constructor(input: SpatializedInput, roomdata: RoomData)
    {
        super();
        this._input = input;
        this._gain = input.get().gain;
        this._cached_params = SourceUtils[input.findSourceType()].defaults();
        this._roomdata = roomdata;
    }

    userId(): string {
        return this._input.get().userid;
    }

    room() {
        return this._input.get().room;
    }

    pan(params: SourceParameterSet): void {
        
        this._cached_params = params;
        
        let sources = SourceUtils[this._input.findSourceType()].pan(params);
        sources.forEach((source, idx) => {
            if(this._encoders[idx])
                this._encoders[idx].panSource(source);
        });
    }

    setAzimuth(a: number): void {
        this._cached_params.a = a;
        this.pan(this._cached_params);
    }

    setElevation(e: number): void {
        this._cached_params.e = e;
        this.pan(this._cached_params);
    }

    setGain(gain: number) {
        this._gain = gain;
        if(this._gain_node)
            this._gain_node.setGain(gain);
        else
            this._encoders.forEach(enc => enc.setGain(gain));
    }    
    
    setHeight(h: number): void {
        this._cached_params.height = h;
        this.pan(this._cached_params);
    }

    setWidth(w: number): void {
        this._cached_params.width = w;
        this.pan(this._cached_params);
    }


    setRoomData(room: RoomData)
    {
        this._encoders.forEach(encoder => encoder.setRoomData(room));
    }

    setRoomEnabled(room: RoomData) 
    {
        this._encoders.forEach(encoder => encoder.setRoomEnabled(room));
    }

    setRoomReflections(room: RoomData) 
    {
        this._encoders.forEach(encoder => encoder.setRoomReflections(room));
    }

    setRoomAttn(room: RoomData) 
    {
        this._encoders.forEach(encoder => encoder.setRoomAttn(room));
    }

    setRoomShape(room: RoomData) 
    {
        this._encoders.forEach(encoder => encoder.setRoomShape(room));
    }

    setRoomHighshelf(room: RoomData) {
        this._encoders.forEach(encoder => encoder.setRoomHighshelf(room));
    }

    setRoomLowshelf(room: RoomData) {
        this._encoders.forEach(encoder => encoder.setRoomLowshelf(room));
    }

    input(graph: Graph): Bus {
        ignore(graph);
        return null;
    }

    output(graph: Graph): Bus {
        ignore(graph);
        return null;
    }

    outputBuses(graph: Graph)
    {
        if(this._gain_node)
            return [ this._gain_node.getMainOutputBus() ];
        else
            return this._encoders.map(encoder => encoder.getMainOutputBus());
    }

    monoRefBuses(): Bus[] {
        if(this._gain_node)
            return [];
        else
            return this._encoders.map(encoder => encoder.monoRefBus());
    }

    stereoRefBuses(): Bus[] {
        if(this._gain_node)
            return [];
        else
            return this._encoders.map(encoder => encoder.stereoRefBus());
    }

    graphChanged(graph: Graph): void 
    {
    }

    build(graph: Graph): void 
    {
        let sourcetype = this._input.findSourceType();
        let sourcechcount = SourceUtils[sourcetype].channels;
        let firstchannel = this._input.findSourceChannel();

        if(isAmbi(sourcetype)) {
            this._gain_node = new GainNode("GainNode " + this._input.get().id, sourcetype);
            this._gain_node.setGain(this._gain);
            this._encoder_nids.push(graph.addNode(this._gain_node));
            let connection = graph.graphRootBus().connectIdx(this._gain_node.getMainInputBus(), firstchannel);
            if(connection)
                graph.addConnection(connection);
            else
                log.error("Could not connect gain node for output");
        } else {
            for(let i = 0; i < sourcechcount; ++i) {
                let node = new RoomSpatializer('' + i);
                node.setRoomData(this._roomdata);
                node.setGain(this._gain);
                this._encoder_nids.push(graph.addNode(node));
                this._encoders.push(node);
                let connection = graph.graphRootBus().connectIdx(node.getMainInputBus(), firstchannel + i);
    
                if(connection)
                    graph.addConnection(connection);
                else {
                    log.error(`Could not connect input for RoomSpatializer ${this._input.get().inputid}`);
                }
            }
    
            this.pan(this._cached_params);
        }
    }

    destroy(graph: Graph): void {
        this._encoders.forEach(enc => graph.removeNode(enc));
        if(this._gain_node)
            graph.removeNode(this._gain_node);
    }
}

export class MultiSpatializerModule extends SpatializationModule {

    _input: SpatializedInput;
    _node_id: number;
    _spatializer_node: MultiSpatializer;
    _gain_node: GainNode;
    _params_cached: SourceParameterSet;
    _cached_gain = 0.;
    _ambi: boolean;

    pan(params: SourceParameterSet): void {
        this._params_cached = params;
        if(this._spatializer_node)
            this._spatializer_node.pan(params);
    }

    setAzimuth(a: number): void {
        this._params_cached.a = a;
        if(this._spatializer_node)
            this._spatializer_node.setAzimuth(a);
    }

    setElevation(e: number): void {
        this._params_cached.e = e;
        if(this._spatializer_node)
            this._spatializer_node.setElevation(e);
    }

    setGain(gain: number) {
        this._cached_gain = gain;
        if(this._spatializer_node)
            this._spatializer_node.setGain(this._cached_gain);
        else if(this._gain_node)
            this._gain_node.setGain(this._cached_gain);
    }

    setHeight(h: number): void {
        this._params_cached.height = h;
        this.pan(this._params_cached);
    }

    setWidth(w: number): void {
        this._params_cached.width = w;
        this.pan(this._params_cached);
    }

    input(graph: Graph): Bus
    {
        return graph.getNode(this._node_id).getMainInputBus();
    }

    output(graph: Graph): Bus
    {
        return graph.getNode(this._node_id).getMainOutputBus();
    }

    outputBuses(graph: Graph): Bus[] {
        return [ graph.getNode(this._node_id).getMainOutputBus() ];
    }

    monoRefBuses(): Bus[] {
        return [ this._spatializer_node.monoRefBus() ];
    }
    stereoRefBuses(): Bus[] {
        return [ this._spatializer_node.stereoRefBus() ];
    }
    

    graphChanged(graph: Graph): void
    {
    }

    userId(): string {
        return this._input.get().userid;
    }

    build(graph: Graph): void
    {
        let node;
        if(this._ambi) {
            node = new GainNode("AmbiSource Gain " + this._input.get().id, this._input.findSourceType());
            this._gain_node = node;
            node.setGain(this._cached_gain);
        } 
        else {
            node = new MultiSpatializer(
                `MultiSpatializer [${this._input.findSourceType()}]`,
                this._input.findSourceType());

            this._spatializer_node = node;
            node.setGain(this._cached_gain);
        }

        this._node_id = graph.addNode(node);

        if(this._spatializer_node)
            this._spatializer_node.pan(this._params_cached);

        let mainInputConnection = graph.graphRootBus().connectIdx(
            node.getMainInputBus(), this._input.findSourceChannel());

        graph.addConnection(mainInputConnection);
    }


    destroy(graph: Graph): void
    {
        if (graph.removeNode(this._node_id))
            log.debug(
                `Removed spatializer from graph node for spatializer module for input ${
                    this._input.get().id}`);
        else
            log.warn(
                `Could not remove spatializer node from graph for spatializer module for input ${
                    this._input.get().id}`);
    }

    constructor(input: SpatializedInput)
    {
        super();
        this._input = input;
        this._params_cached = SourceUtils[input.findSourceType()].defaults();
        this._ambi = isAmbi(input.findSourceType());
        this._cached_gain = input.get().gain;
    }
};
