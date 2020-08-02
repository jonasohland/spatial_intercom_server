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
import { SIServerWSSession } from './communication';
import { SpatialIntercomServer } from "./server";

const log = Logger.get('DSPBLD');

export const GraphBuilderInputEvents = {
    FULL_REBUILD: 'rebuildgraph-full',
    REBUILD: 'rebuildgraph-partial',
    PAN: 'pan',
    AZM: 'azm',
    ELV: 'elv',
    GAIN: 'gain',
    ROOM_ENABLED: 'roomenabled',
    ROOM_REFLECTIONS: 'roomreflections',
    ROOM_SHAPE: 'roomshape',
    ROOM_ATTN: 'roomattn',
    ROOM_HIGHSHELF: 'roomhighshelf',
    ROOM_LOWSHELF: 'roomlowshelf',
    ASSIGN_HEADTRACKER: 'assignheadtracker',
}

export const GraphBuilderOutputEvents = {

}

export class NodeDSPGraphBuilder extends NodeModule {

    user_modules: Record<string, SimpleUsersModule> = {};
    basic_spatializers: Record<string, Record<string, MulitSpatializerModule>> = {};
    room_spatializers: Record<string, Record<string, RoomSpatializerModule>> = {};

    is_building: boolean = false;

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
        this.handleModuleEvent(GraphBuilderInputEvents.ASSIGN_HEADTRACKER, this._dispatch_assign_headtracker.bind(this));
        log.info("Remote node address", (<SIServerWSSession> this.myNode().remote()).remoteInfo());
    }

    start(connection: Connection)
    {

    }

    rebuildGraph()
    {
        this._do_rebuild_graph_full();
    }

    _do_rebuild_graph_full() 
    {
        if(this.is_building)
            log.error("Currently rebuilding graph.");

        this.is_building = true;
        this.dsp().resetGraph().then(() => {

            this.user_modules = {};
            this.basic_spatializers = {};
            this.room_spatializers = {};

            try {
                this._build_spatializer_modules();
                this._build_user_modules();
            } catch (err) {
                log.error("Failed to build modules: ", err);
            }

            this.dsp().syncGraph().then(() => {
                this.is_building = false;
            });
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

    _dispatch_assign_headtracker(userid: string, headtrackerid: number)
    {
        log.info("Assign headtracker " + headtrackerid + "to user " + userid);
        let headtracker = this.headtrackers().getHeadtracker(headtrackerid);
        if(headtracker) {
            try {
                headtracker.setStreamDest((<SIServerWSSession> this.myNode().remote()).remoteInfo(), 10099);
            }
            catch(err) {

            }
        }

        if(this.user_modules[userid]) {
            this.user_modules[userid].setHeadtrackerId(headtrackerid);
        }
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
        return (<DSPNode> this.myNode()).rooms;
    }

    nodeUsers() {
        return (<DSPNode> this.myNode()).users;
    }

    nodeInputs() {
        return (<DSPNode> this.myNode()).inputs;
    }

    headtrackers()
    {
        return (<SpatialIntercomServer> this._server).headtracking;
    }

    dsp() {
        return (<DSPNode> this.myNode()).dsp_process;
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
                    log.info("Rebuild graph on node " + node.name());
                    this.emitToModule(node.id(), DSPModuleNames.GRAPH_BUILDER, GraphBuilderInputEvents.FULL_REBUILD);
                }
            })
        });

        this.handleWebInterfaceEvent('committnodeodsp', (socket: SocketIO.Socket, node: DSPNode) => {
            log.warn("REBUILD " + node.name());
            this.emitToModule(node.id(), DSPModuleNames.GRAPH_BUILDER, GraphBuilderInputEvents.FULL_REBUILD);
        });

        this.handleWebInterfaceEvent('rebuildgraph', (socket: SocketIO.Socket, node: DSPNode) => {
            this.emitToModule(node.id(), DSPModuleNames.GRAPH_BUILDER, GraphBuilderInputEvents.FULL_REBUILD);
        })
    }

    joined(socket: SocketIO.Socket, topic: string)
    {

    }

    left(socket: SocketIO.Socket, topic: string)
    {

    }
}