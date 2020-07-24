import { PortTypes, SourceUtils, SourceParameterSet, Source} from './dsp_defs';
import {
    AmbiBus,
    Bus,
    Connection,
    Graph,
    Module,
    NativeNode,
} from './dsp_graph'
import {GraphBuilderOutputEvents} from './dsp_graph_builder';
import * as Logger from './log';
import {SpatializedInput, User} from './users';
import {UserData} from './users_defs';
import { ignore } from './util';
import { RoomData } from './rooms_defs';
import { Room } from './rooms';

const log = Logger.get('DSP');

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
        console.log('Remote attached!');
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

export class AdvancedSpatializer extends NativeNode {
    onRemotePrepared(): void 
    {
    }

    _cached_source: Source;

    constructor(name: string)
    {
        super(name, 'advanced_spatializer');
        this.addInputBus(Bus.createMainAny(1));
        this.addOutputBus(AmbiBus.createMainForOrder(3, 1));
    }

    remoteAttached(): void
    {
        console.log('Remote attached!');
    }

    onRemoteAlive(): void
    {
    }

    panSource(source: Source)
    {
        this._cached_source = source;
        this._setxyz(source.a, source.e);
    }

    async _setxyz(a: number, e: number)
    {
        if(this.remote) {
            let x = Math.cos(a) * Math.cos(e) * 0.15 + 0.5;
            let y = Math.sin(a) * Math.cos(e) * 0.15 + 0.5;
            let z = Math.sin(e) * 0.15 + 0.5;
            return this.remote.set('xyz', { x, y, z });
        }
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
    onRemotePrepared(): void {
    }
    onRemoteAlive(): void
    {
    }

    constructor(name: string)
    {
        super(name, 'advanced_binaural_decoder');
        this.addInputBus(AmbiBus.createMainForOrder(3, 1));
        this.addOutputBus(Bus.createMainStereo(1));
    }

    remoteAttached()
    {
    }

    async setHeadtrackerId(id: number)
    {
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

export class AdvancedSpatializerModule {

    setAzm(azm: number): void
    {
        this.cachedAzm = (azm / 360) * 2 * Math.PI;
        this.sendPosData();
    }
    setElv(elv: number): void
    {
        this.cachedElv = (elv / 360) * 2 * Math.PI;
        this.sendPosData();
    }
    setStWidth(stwidth: number): void
    {
        this.cachedStWidth = (stwidth / 360) * 2 * Math.PI;
        this.sendPosData();
    }

    setReflections(reflections: number)
    {

        if (this.processorR) {

            this.processorL.remote.set('reflections', 0);
            this.processorR.remote.set('reflections', 0);
        }
        else
            this.processorL.remote.set('reflections', reflections);
    }

    setRoomCharacter(character: number)
    {

        this.processorL.remote.set('room_character', character);

        if (this.processorR)
            this.processorR.remote.set('room_character', character);
    }

    encoder_l_nid: number = -1;
    encoder_r_nid: number = -1;
    id: number            = -1;
    inputConnL: Connection;
    inputConnR: Connection;
    processorL: AdvancedSpatializer;
    processorR: AdvancedSpatializer;

    cachedElv: number     = 0;
    cachedAzm: number     = 0;
    cachedStWidth: number = 0;

    destroy(graph: Graph)
    {
    }

    input(graph: Graph): Bus
    {
        return graph.getNode(this.encoder_l_nid).getMainInputBus();
    }

    output(graph: Graph): Bus
    {
        return graph.getNode(this.encoder_l_nid).getMainOutputBus();
    }

    graphChanged(graph: Graph): void
    {
    }

    build(graph: Graph): void
    {
    }

    sendPosData()
    {

        let azmL = this.cachedAzm;

        let X = Math.cos(azmL) * Math.cos(this.cachedElv) * 0.15 + 0.5;
        let Y = Math.sin(azmL) * Math.cos(this.cachedElv) * 0.15 + 0.5;
        let Z = Math.sin(this.cachedElv) * 0.15 + 0.5;

        this.processorL.remote.set('xyz', { x : X, y : Y, z : Z });

        if (this.processorR) {

            let azmR = this.cachedAzm + (this.cachedStWidth / 2);

            let X2 = Math.cos(azmR) * Math.cos(this.cachedElv) * 0.15 + 0.5;
            let Y2 = Math.sin(azmR) * Math.cos(this.cachedElv) * 0.15 + 0.5;
            let Z2 = Math.sin(this.cachedElv) * 0.15 + 0.5;

            this.processorR.remote.set('xyz', { x : X2, y : Y2, z : Z2 });
        }
    }
}


export abstract class SpatializationModule extends Module {
    abstract pan(params: SourceParameterSet) : void;
    abstract setAzimuth(a: number): void;
    abstract setElevation(e: number): void;
    abstract userId(): string;
    abstract outputBuses(graph: Graph): Bus[];
}

export class MultiSpatializer extends NativeNode {


    _chtype: PortTypes;
    _chcount: number;
    _params: SourceParameterSet;
    _mute: boolean = false;

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
        return this._apply_sources();
    }

    async _apply_sources()
    {
        return this.remote.set('sources', SourceUtils[this._chtype].pan(this._params));
    }

    constructor(name: string, type: PortTypes)
    {
        super(name, 'multi_spatializer');
        this._chtype = type;
        this._chcount = SourceUtils[type].channels;
        this.addInputBus(Bus.createMain(1, type));
        this.addOutputBus(Bus.createMain(1, PortTypes.Ambi_O3));
        this._params = SourceUtils[type].defaults();
        this._params.e = -10;
    }
}

export class RoomSpatializer extends NativeNode {

    _cached_source: Source;
    _remote_alive: boolean = false;
    _roomdata: RoomData;

    constructor(name: string)
    {
        super(name, 'advanced_spatializer');
        this.addInputBus(Bus.createMainAny(1));
        this.addOutputBus(AmbiBus.createMainForOrder(3, 1));
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
        this._set_roomdata().catch(err => log.error(err));
    }

    panSource(source: Source)
    {
        this._cached_source = source;
        this._setxyz(source.a, source.e);
    }

    setRoomData(room: RoomData)
    {
        this._roomdata = room;
        this._set_roomdata().catch(err => log.error(err));
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
        await this.remote.set('shape', this._roomdata.room);
        await this.remote.set('highshelf', this._roomdata.eq.high);
        await this.remote.set('lowshelf', this._roomdata.eq.low);
        await this.remote.set('attn', this._roomdata.attn);
        
        if(this._roomdata.enabled)
            await this.remote.set('reflections', this._roomdata.reflections);
        else
            await this.remote.set('reflections', 0.);
    }

    async _setxyz(a: number, e: number)
    {
        a = a * Math.PI / 180;
        e = e * Math.PI / 180;
        if(this._remote_alive) {
            let x = Math.cos(a) * Math.cos(e) * 0.15 + 0.5;
            let y = Math.sin(a) * Math.cos(e) * 0.15 + 0.5;
            let z = Math.sin(e) * 0.15 + 0.5;
            return this.remote.set('xyz', { x, y, z });
        }
    }
}

export class SimpleUsersModule extends Module {

    _usr: User;
    _decoder_id: number;

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

    build(graph: Graph): void
    {

        let node         = new BasicBinauralDecoder(this._usr.get().name, 3);
        this._decoder_id = graph.addNode(node);

        let spatializers = <SpatializationModule[]>graph.modules.filter(
            module => module instanceof SpatializationModule);
        let my_spatializers = spatializers.filter(sp => sp.userId()
                                                        === this._usr.get().id);

        my_spatializers.forEach(spatializer => {
            spatializer.outputBuses(graph).forEach(bus => {
                let con = bus.connect(node.getMainInputBus());
                if(con)
                    graph.addConnection(con);
            });
        });

        let output_con = node.getMainOutputBus().connectOtherIdx(
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
    _cached_params: SourceParameterSet;
    _roomdata: RoomData;

    constructor(input: SpatializedInput, roomdata: RoomData)
    {
        super();
        this._input = input;
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
        return this._encoders.map(encoder => encoder.getMainOutputBus());
    }

    graphChanged(graph: Graph): void 
    {
    }

    build(graph: Graph): void 
    {
        let sourcetype = this._input.findSourceType();
        let sourcechcount = SourceUtils[sourcetype].channels;
        let firstchannel = this._input.findSourceChannel();

        for(let i = 0; i < sourcechcount; ++i) {
            let node = new RoomSpatializer('' + i);
            node.setRoomData(this._roomdata);
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

    destroy(graph: Graph): void {
        this._encoders.forEach(enc => graph.removeNode(enc));
    }
}

export class MulitSpatializerModule extends SpatializationModule {
    
    _input: SpatializedInput;
    _spatializer_node_id: number;
    _spatializer_node: MultiSpatializer;
    _params_cached: SourceParameterSet;

    pan(params: SourceParameterSet): void {
        this._params_cached = params;
        if(this._spatializer_node)
            this._spatializer_node.pan(params);
    }

    setAzimuth(a: number): void {
        console.log("Multispatializer " + a);
        this._params_cached.a = a;
        if(this._spatializer_node)
            this._spatializer_node.setAzimuth(a);
    }

    setElevation(e: number): void {
        this._params_cached.e = e;
        if(this._spatializer_node)
            this._spatializer_node.setElevation(e);
    }

    input(graph: Graph): Bus
    {
        return graph.getNode(this._spatializer_node_id).getMainInputBus();
    }

    output(graph: Graph): Bus
    {
        return graph.getNode(this._spatializer_node_id).getMainOutputBus();
    }

    outputBuses(graph: Graph): Bus[] {
        return [ graph.getNode(this._spatializer_node_id).getMainOutputBus() ];
    }

    graphChanged(graph: Graph): void
    {
    }

    userId(): string {
        return this._input.get().userid;
    }

    build(graph: Graph): void
    {

        let node = new MultiSpatializer(
            `MultiSpatializer [${this._input.findSourceType()}]`,
            this._input.findSourceType());

        this._spatializer_node = node;
        this._spatializer_node_id = graph.addNode(node);

        this._spatializer_node.pan(this._params_cached);

        let mainInputConnection = graph.graphRootBus().connectIdx(
            node.getMainInputBus(), this._input.findSourceChannel());

        graph.addConnection(mainInputConnection);
    }


    destroy(graph: Graph): void
    {
        if (graph.removeNode(this._spatializer_node_id))
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
    }
};
