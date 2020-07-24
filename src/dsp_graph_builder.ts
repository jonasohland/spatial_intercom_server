import { NodeModule, ServerModule } from "./core";
import { Connection, NODE_TYPE } from "./communication";
import { AdvancedSpatializerModule,  MulitSpatializerModule, SimpleUsersModule, RoomSpatializerModule, MultiSpatializer } from "./dsp_modules";
import  * as Logger from './log';
import { DSPModuleNames, DSPNode } from "./dsp_node";
import { NodeUsersManager } from "./users";
import { NodeAudioInputManager } from "./inputs";
import { DSPController } from "./dsp_process";
import { SourceParameterSet } from "./dsp_defs";
import { Room, NodeRooms } from "./rooms";
import { RoomData } from "./rooms_defs";
import { some } from "lodash";

const log = Logger.get('DSPBLD');

export const GraphBuilderInputEvents = {
    FULL_REBUILD: 'rebuildgraph-full',
    REBUILD: 'rebuildgraph-partial',
    PAN: 'pan',
    AZM: 'azm',
    ELV: 'elv',
    ROOM_ENABLED: 'roomenabled',
    ROOM_REFLECTIONS: 'roomreflections',
    ROOM_SHAPE: 'roomshape',
    ROOM_ATTN: 'roomattn',
    ROOM_HIGHSHELF: 'roomhighshelf',
    ROOM_LOWSHELF: 'roomlowshelf'
}

export const GraphBuilderOutputEvents = {

}

export class NodeDSPGraphBuilder extends NodeModule {

    user_modules: Record<string, SimpleUsersModule> = {};
    basic_spatializers: Record<string, Record<string, MulitSpatializerModule>> = {};
    room_spatializers: Record<string, Record<string, RoomSpatializerModule>> = {};

    constructor()
    {
        super(DSPModuleNames.GRAPH_BUILDER);
    }

    destroy()
    {

    }

    joined(socket: SocketIO.Socket, topic: string)
    {
        
    }

    left(socket: SocketIO.Socket, topic: string)
    {

    }

    init()
    {
        this.handleModuleEvent(GraphBuilderInputEvents.FULL_REBUILD, this._do_rebuild_graph_full.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.PAN, this._dispatch_pan.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.AZM, this._dispatch_azimuth_pan.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.ELV, this._dispatch_elevation_pan.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.ROOM_ENABLED, this._dispatch_room_enabled.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.ROOM_REFLECTIONS, this._dispatch_room_reflections.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.ROOM_ATTN, this._dispatch_room_attn.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.ROOM_HIGHSHELF, this._dispatch_room_highshelf.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.ROOM_LOWSHELF, this._dispatch_room_lowshelf.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.ROOM_SHAPE, this._dispatch_room_shape.bind(this));
    }

    start(connection: Connection)
    {

    }

    _do_rebuild_graph_full() 
    {
        this.dsp().resetGraph().then(() => {

            this.user_modules = {};
            this.basic_spatializers = {};
            this.room_spatializers = {};

            try {
                this._build_spatializer_modules();
                this._build_user_modules();
            } catch (err) {
                console.log(err);
            }

            this.dsp().syncGraph();
        }).catch(err => {
            log.error("Could not reset graph: " + err);
        })
    }

    _build_spatializer_modules()
    {
        this.nodeUsers().listUsers().forEach(user => {

            let userdata = user.get();

            log.verbose("Build input modules for user " + userdata.name);
            this.basic_spatializers[userdata.id] = {};
            this.room_spatializers[userdata.id] = {};

            this.nodeUsers().getUsersInputs(userdata.id).forEach(input => {

                if(input.isInRoom()) {
                    log.verbose(`Build advanced input module for ${input.get().id}`);
                    let mod = new RoomSpatializerModule(input, this.getRooms().getRoom(input.get().room));
                    this.room_spatializers[userdata.id][input.get().id] = mod;
                    mod.pan(input.params());
                    this.graph().addModule(mod);
                }
                else {
                    log.verbose(`Build basic input module for ${input.get().id}`);
                    let mod = new MulitSpatializerModule(input);
                    this.basic_spatializers[userdata.id][input.get().id] = mod;
                    mod.pan(input.params());
                    this.graph().addModule(mod);
                }
            });

            let usermod = new SimpleUsersModule(user);
            this.graph().addModule(usermod);
        });
    }

    _dispatch_azimuth_pan(userid: string, spid: string, azm: number)
    {
        let module = this._find_spatializer(userid, spid);
        if(module)
            module.setAzimuth(azm);
    }

    _dispatch_elevation_pan(userid: string, spid: string, elv: number)
    {
        let module = this._find_spatializer(userid, spid);
        if(module)
            module.setElevation(elv);
    }

    _dispatch_pan(userid: string, spid: string, params: SourceParameterSet)
    {
        let module = this._find_spatializer(userid, spid);
        if(module)
            module.pan(params);
    }

    _dispatch_room_enabled(roomid: string, room: RoomData)
    {
        this._find_spatializers_for_room(roomid).forEach(sp => sp.setRoomEnabled(room));
    }

    _dispatch_room_reflections(roomid: string, room: RoomData)
    {
        this._find_spatializers_for_room(roomid).forEach(sp => sp.setRoomReflections(room));
    }

    _dispatch_room_attn(roomid: string, room: RoomData) 
    {
        this._find_spatializers_for_room(roomid).forEach(sp => sp.setRoomAttn(room));
    }

    _dispatch_room_shape(roomid: string, room: RoomData) 
    {
        this._find_spatializers_for_room(roomid).forEach(sp => sp.setRoomShape(room));
    }

    _dispatch_room_highshelf(roomid: string, room: RoomData)
    {
        this._find_spatializers_for_room(roomid).forEach(sp => sp.setRoomHighshelf(room));
    }

    _dispatch_room_lowshelf(roomid: string, room: RoomData)
    {
        this._find_spatializers_for_room(roomid).forEach(sp => sp.setRoomLowshelf(room));
    }

    _build_user_modules() 
    {
        this.nodeUsers().listRawUsersData().forEach((usr) => {
            
        });
    }

    _find_spatializer(userid: string, spid: string)
    {   
        if(this.basic_spatializers[userid]) {
            if(this.basic_spatializers[userid][spid])
                return this.basic_spatializers[userid][spid];
        }

        if(this.room_spatializers[userid]) {
            if(this.room_spatializers[userid][spid])
                return this.room_spatializers[userid][spid];
        }
    }

    _find_spatializers_for_room(room: string)
    {
        let spatializers = [];
        for (let userid of Object.keys(this.room_spatializers)) {
            for(let spatializerid of Object.keys(this.room_spatializers[userid])) {
                if(this.room_spatializers[userid][spatializerid].room() === room)
                    spatializers.push(this.room_spatializers[userid][spatializerid]);
            }
        }
        return spatializers;
    }

    getRooms() {
        return (<NodeRooms> this.myNode().getModule(DSPModuleNames.ROOMS));
    }

    nodeUsers() {
        return <NodeUsersManager> this.myNode().getModule(DSPModuleNames.USERS);
    }

    nodeInputs() {
        return <NodeAudioInputManager> this.myNode().getModule(DSPModuleNames.INPUTS);
    }

    dsp() {
        return <DSPController> this.myNode().getModule(DSPModuleNames.DSP_PROCESS);
    }

    graph() {
        return this.dsp().graph();
    }

}

export class DSPGraphController extends ServerModule {

    constructor()
    {
        super("graph-controller");
    }

    init()
    {
        this.handleGlobalWebInterfaceEvent('committodsp', (socket: SocketIO.Socket, data) => {
            this.server.nodes().forEach(node => {
                if(node.type() == NODE_TYPE.DSP_NODE) {
                    this.emitToModule(node.id(), DSPModuleNames.GRAPH_BUILDER, GraphBuilderInputEvents.FULL_REBUILD);
                }
            })
        });
    }

    joined(socket: SocketIO.Socket, topic: string)
    {

    }

    left(socket: SocketIO.Socket, topic: string)
    {

    }
}