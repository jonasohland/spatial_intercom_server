import {Connection, NODE_TYPE} from './communication';
import {SIServerWSSession} from './communication';
import {NodeModule, ServerModule} from './core';
import {SourceParameterSet} from './dsp_defs';
import {
    MultiSpatializerModule,
    RoomSpatializerModule,
    SimpleUsersModule
} from './dsp_modules';
import {DSPModuleNames, DSPNode} from './dsp_node';
import * as Logger from './log';
import {RoomData} from './rooms_defs';
import {SpatialIntercomServer} from './server';
import {XTCSettings} from './users_defs';

const log = Logger.get('DSPBLD');

export const GraphBuilderInputEvents = {
    FULL_REBUILD: 'rebuildgraph-full',
    REBUILD: 'rebuildgraph-partial',
    PAN: 'pan',
    AZM: 'azm',
    ELV: 'elv',
    HEIGHT: 'height',
    WIDTH: 'width',
    GAIN: 'gain',
    ROOM_ENABLED: 'roomenabled',
    ROOM_REFLECTIONS: 'roomreflections',
    ROOM_SHAPE: 'roomshape',
    ROOM_ATTN: 'roomattn',
    ROOM_HIGHSHELF: 'roomhighshelf',
    ROOM_LOWSHELF: 'roomlowshelf',
    ASSIGN_HEADTRACKER: 'assignheadtracker',
    SET_GAIN: 'setgain',
    MODIFY_XTC: 'modifyxtc',
    PLAYSTATES: 'playstates',
    RESET_PLAYSTATES: 'reset-playstates'
}

export const GraphBuilderOutputEvents = {

}

export class NodeDSPGraphBuilder extends NodeModule {

    user_modules: Record<string, SimpleUsersModule> = {};
    basic_spatializers:
        Record<string, Record<string, MultiSpatializerModule>> = {};
    room_spatializers:
        Record<string, Record<string, RoomSpatializerModule>> = {};

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
        this.handleModuleEvent(GraphBuilderInputEvents.FULL_REBUILD,
                               this._do_rebuild_graph_full.bind(this));
        this.handleModuleEvent(
            GraphBuilderInputEvents.PAN, this._dispatch_pan.bind(this));
        this.handleModuleEvent(
            GraphBuilderInputEvents.AZM, this._dispatch_azimuth_pan.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.ELV,
                               this._dispatch_elevation_pan.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.HEIGHT,
                               this._dispatch_height_pan.bind(this));
        this.handleModuleEvent(
            GraphBuilderInputEvents.WIDTH, this._dispatch_width_pan.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.ROOM_ENABLED,
                               this._dispatch_room_enabled.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.ROOM_REFLECTIONS,
                               this._dispatch_room_reflections.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.ROOM_ATTN,
                               this._dispatch_room_attn.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.ROOM_HIGHSHELF,
                               this._dispatch_room_highshelf.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.ROOM_LOWSHELF,
                               this._dispatch_room_lowshelf.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.ROOM_SHAPE,
                               this._dispatch_room_shape.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.ASSIGN_HEADTRACKER,
                               this._dispatch_assign_headtracker.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.SET_GAIN,
                               this._dispatch_set_gain.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.MODIFY_XTC,
                               this._dispatch_modify_xtc.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.PLAYSTATES, this._dispatch_set_playstates.bind(this));
        this.handleModuleEvent(GraphBuilderInputEvents.RESET_PLAYSTATES, this._dispatch_reset_playstates.bind(this));

        log.info('Remote node address',
                 (<SIServerWSSession>this.myNode().remote()).remoteInfo());
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
        if (this.is_building)
            log.error('Currently rebuilding graph.');

        this.is_building = true;
        this.dsp()
            .resetGraph()
            .then(() => {
                this.user_modules       = {};
                this.basic_spatializers = {};
                this.room_spatializers  = {};

                try {
                    this._build_spatializer_modules();
                    this._build_user_modules();
                }
                catch (err) {
                    log.error('Failed to build modules: ', err);
                }

                this.dsp().syncGraph().then(() => {
                    this.is_building = false;
                });
            })
            .catch(err => {
                log.error('Could not reset graph: ' + err);
            })
    }

    _build_spatializer_modules()
    {
        this.nodeUsers().listUsers().forEach(user => {

            let userdata = user.get();
            
            log.verbose('Build input modules for user ' + userdata.name);

            this.basic_spatializers[userdata.id] = {};
            this.room_spatializers[userdata.id]  = {};

            this.nodeUsers().getUsersInputs(userdata.id).forEach(input => {
                if (input.isInRoom()) {
                    log.verbose(
                        `Build advanced input module for ${input.get().id}`);
                    let mod = new RoomSpatializerModule(
                        input, this.getRooms().getRoom(input.get().room));
                    this.room_spatializers[userdata.id][input.get().id] = mod;
                    mod.pan(input.params());
                    this.graph().addModule(mod);
                }
                else {
                    log.verbose(
                        `Build basic input module for ${input.get().id}`);
                    let mod = new MultiSpatializerModule(input);
                    this.basic_spatializers[userdata.id][input.get().id] = mod;
                    mod.pan(input.params());
                    this.graph().addModule(mod);
                }
            });

            let usermod = new SimpleUsersModule(user);
            this.user_modules[userdata.id] = usermod;
            this.graph().addModule(usermod);
        });
    }

    _dispatch_azimuth_pan(userid: string, spid: string, azm: number)
    {
        let module = this._find_spatializer(userid, spid);
        if (module)
            module.setAzimuth(azm);
        else {
            log.error(`Could not find spatializer for input user ${
                userid} input ${spid}`);
        }
    }

    _dispatch_elevation_pan(userid: string, spid: string, elv: number)
    {
        let module = this._find_spatializer(userid, spid);
        if (module)
            module.setElevation(elv);
        else {
            log.error(`Could not find spatializer for input user ${
                userid} input ${spid}`);
        }
    }

    _dispatch_width_pan(userid: string, spid: string, width: number)
    {
        let module = this._find_spatializer(userid, spid);
        if (module)
            module.setWidth(width);
        else {
            log.error(`Could not find spatializer for input user ${
                userid} input ${spid}`);
        }
    }

    _dispatch_height_pan(userid: string, spid: string, height: number)
    {
        let module = this._find_spatializer(userid, spid);
        if (module)
            module.setHeight(height);
        else {
            log.error(`Could not find spatializer for input user ${
                userid} input ${spid}`);
        }
    }

    _dispatch_pan(userid: string, spid: string, params: SourceParameterSet)
    {
        let module = this._find_spatializer(userid, spid);
        if (module)
            module.pan(params);
        else {
            log.error(`Could not find spatializer for input user ${
                userid} input ${spid}`);
        }
    }

    _dispatch_room_enabled(roomid: string, room: RoomData)
    {
        this._find_spatializers_for_room(roomid).forEach(
            sp => sp.setRoomEnabled(room));
    }

    _dispatch_room_reflections(roomid: string, room: RoomData)
    {
        this._find_spatializers_for_room(roomid).forEach(
            sp => sp.setRoomReflections(room));
    }

    _dispatch_room_attn(roomid: string, room: RoomData)
    {
        this._find_spatializers_for_room(roomid).forEach(
            sp => sp.setRoomAttn(room));
    }

    _dispatch_room_shape(roomid: string, room: RoomData)
    {
        this._find_spatializers_for_room(roomid).forEach(
            sp => sp.setRoomShape(room));
    }

    _dispatch_room_highshelf(roomid: string, room: RoomData)
    {
        this._find_spatializers_for_room(roomid).forEach(
            sp => sp.setRoomHighshelf(room));
    }

    _dispatch_room_lowshelf(roomid: string, room: RoomData)
    {
        this._find_spatializers_for_room(roomid).forEach(
            sp => sp.setRoomLowshelf(room));
    }

    _dispatch_assign_headtracker(userid: string, headtrackerid: number)
    {
        log.info(`Assign headtracker ${headtrackerid} to user ${userid}`);
        let headtracker = this.headtrackers().getHeadtracker(headtrackerid);
        if (headtracker) {
            try {
                headtracker.setStreamDest(
                    (<SIServerWSSession>this.myNode().remote()).remoteInfo(),
                    10099);
            }
            catch (err) {
                log.error(
                    `Could not set headtracker stream destination: ${err}`);
            }
        }

        if (this.user_modules[userid]) {
            this.user_modules[userid].setHeadtrackerId(headtrackerid);
        }
    }

    _dispatch_modify_xtc(userid: string, settings: XTCSettings)
    {
        log.info(`Modify xtc settings ${
            settings.enabled_st ? '(stereo on)' : '(stereo off)'} ${
            settings.enabled_bin ? '(binaural on)' : 'binaural off'}`);

        let usermodule = this._find_usermodule(userid);
        if (usermodule) 
            usermodule.setXTCSettings(settings);
        else
            log.error(`Could not find user for id ${userid}`);
    }

    _dispatch_set_gain(userid: string, spid: string, gain: number)
    {
        let sp = this._find_spatializer(userid, spid);
        if (sp)
            sp.setGain(gain);
        else
            log.error(`Could not find spatializer for input user ${
                userid} input ${spid}`);
    }

    _dispatch_set_playstates(userid: string, sid: string, playstates: any[]) 
    {
        let sp = this._find_spatializer(userid, sid);
        if (sp) 
            sp.setTestSoundPlayState(playstates);
        else
            log.error(`Could not find Spatializer for userid ${userid} input id ${sid}`);
    }

    _dispatch_reset_playstates(userid: string, sid: string)
    {
        let sp = this._find_spatializer(userid, sid);
        if (sp) 
            sp.resetTestSoundPlayState();
        else
            log.error(`Could not find Spatializer for userid ${userid} input id ${sid}`);
    }

    _build_user_modules()
    {
        this.nodeUsers().listRawUsersData().forEach((usr) => {

                                                    });
    }

    _find_spatializer(userid: string, spid: string)
    {
        if (this.basic_spatializers[userid]) {
            if (this.basic_spatializers[userid][spid])
                return this.basic_spatializers[userid][spid];
        }

        if (this.room_spatializers[userid]) {
            if (this.room_spatializers[userid][spid])
                return this.room_spatializers[userid][spid];
        }
    }

    _find_spatializers_for_room(room: string)
    {
        let spatializers = [];
        for (let userid of Object.keys(this.room_spatializers)) {
            for (let spatializerid of Object.keys(
                     this.room_spatializers[userid]))
                 
                {
                    if (this.room_spatializers[userid][spatializerid].room()
                        === room)
                        spatializers.push(
                            this.room_spatializers[userid][spatializerid]);
                }
        }
        return spatializers;
    }

    _find_usermodule(userid: string)
    {
        return this.user_modules[userid];
    }

    getRooms()
    {
        return (<DSPNode>this.myNode()).rooms;
    }

    nodeUsers()
    {
        return (<DSPNode>this.myNode()).users;
    }

    nodeInputs()
    {
        return (<DSPNode>this.myNode()).inputs;
    }

    headtrackers()
    {
        return (<SpatialIntercomServer>this._server).headtracking;
    }

    dsp()
    {
        return (<DSPNode>this.myNode()).dsp_process;
    }

    graph()
    {
        return this.dsp().graph();
    }
}

export class DSPGraphController extends ServerModule {

    constructor()
    {
        super('graph-controller');
    }

    init()
    {
        this.handleGlobalWebInterfaceEvent(
            'committodsp',
            (socket: SocketIO.Socket,
             data) => { this.server.nodes(NODE_TYPE.DSP_NODE).forEach(node => {
                if (node.type() == NODE_TYPE.DSP_NODE) {
                    log.info('Rebuild graph on node ' + node.name());
                    this.emitToModule(node.id(), DSPModuleNames.GRAPH_BUILDER,
                                      GraphBuilderInputEvents.FULL_REBUILD);
                }
            }) });

        this.handleWebInterfaceEvent(
            'committnodeodsp', (socket: SocketIO.Socket, node: DSPNode) => {
                log.warn('REBUILD ' + node.name());
                this.emitToModule(node.id(), DSPModuleNames.GRAPH_BUILDER,
                                  GraphBuilderInputEvents.FULL_REBUILD);
            });

        this.handleWebInterfaceEvent(
            'rebuildgraph', (socket: SocketIO.Socket, node: DSPNode) => {
                this.emitToModule(node.id(), DSPModuleNames.GRAPH_BUILDER,
                                  GraphBuilderInputEvents.FULL_REBUILD);
            })
    }

    joined(socket: SocketIO.Socket, topic: string)
    {
    }

    left(socket: SocketIO.Socket, topic: string)
    {
    }
}