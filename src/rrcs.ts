
import {EventEmitter2} from 'eventemitter2';
import * as fs from 'fs';
import {first} from 'lodash';
import {PortInfo} from 'serialport';
import xmlrpc from 'xmlrpc';

import {configFileDir} from './files';
import * as Logger from './log';
import { Crosspoint, CrosspointSync, CrosspointVolumeSourceState, xpvtid, CrosspointState, CrosspointVolumeTarget, __xpid, xpVtEqual, CrosspointVolumeSource } from './rrcs_defs';

const log    = Logger.get('RRCSSV');
const artlog = Logger.get('ARTIST');

function logArtistCall(method: string, params: number)
{
    artlog.debug(`Call artist method ${method} with ${params} args`);
}

interface ArtistPortInfo {
    Input: boolean
    KeyCount: number
    Label: string
    Name: string
    Node: number
    ObjectID: number
    Output: boolean
    PageCount: number
    Port: number
    PortType: string
    HasSecondChannel?: boolean
}


export interface ArtistState {
    gateway: boolean, artist: boolean, artist_nodes: ArtistNodeInfo[]
}

interface ArtistNodeInfo {
    id: number, ports: ArtistPortInfo[]
}

class ArtistNodePort {

    info: ArtistPortInfo;
    _srv: RRCSServer;

    constructor(srv: RRCSServer, info: ArtistPortInfo)
    {
        this._srv = srv;
        this.info = info;
    }

    destroy()
    {
    }
}

class ArtistNode {

    _id: number;
    _ports: ArtistNodePort[] = [];
    _srv: RRCSServer;

    constructor(srv: RRCSServer, id: number)
    {
        this._srv = srv;
        this._id  = id;
    }

    getPort(portidx: number, input: boolean, output: boolean)
    {
        return this._ports.find(port => port.info.Port == portidx
                                        && port.info.Input === input
                                        && port.info.Output === output)
    }

    getPortFromInfo(info: ArtistPortInfo)
    {
        return this.getPort(info.Port, info.Input, info.Output);
    }

    removePort(portidx: number, input: boolean, output: boolean)
    {
        let idx = this._ports.indexOf(this.getPort(portidx, input, output));
        if (idx != -1)
            return this._ports.splice(idx, 1);
    }

    addPort(info: ArtistPortInfo)
    {
        this._ports.push(new ArtistNodePort(this._srv, info));
    }

    reset()
    {
        while (this._ports.length)
            this._ports.pop().destroy();
    }

    destroy()
    {
        this.reset()
    }

    nodeID()
    {
        return this._id;
    }
}

function crosspointToParams(xp: Crosspoint, net: number)
{
    return [
        net, xp.Source.Node, xp.Source.Port, net, xp.Destination.Node,
        xp.Destination.Port
    ];
}

function crosspointFromParams(params: any[]): Crosspoint
{
    return {
        Source : { Node : params[1], Port : params[2], IsInput : true },
        Destination : { Node : params[4], Port : params[5], IsInput : false }
    };
}

function pad(num: number, size: number)
{
    var s = '000000000' + num;
    return s.substr(s.length - size);
}

export abstract class RRCSServer extends EventEmitter2 {

    _cl: xmlrpc.Client;
    _srv: xmlrpc.Server;

    _artist_online: boolean  = false;
    _gateway_online: boolean = false;

    _local_port: number = 61505;
    _local_ip: string   = '192.168.178.91';
    _trs_cnt            = 0;

    _connect_retry_timeout: NodeJS.Timeout;

    _nodes: ArtistNode[] = [];

    abstract onArtistConfigurationChanged(): void;
    abstract onXpValueChanged(crosspoint: Crosspoint, single?: number,
                              conf?: number): void;
    abstract onXpsChanged(xps: CrosspointState[]): void;
    abstract xpsToListenTo(): Crosspoint[];
    abstract async onArtistOnline(): Promise<void>;

    constructor(rrcs_host: string, rrcs_port: number)
    {
        super();
        log.info('Server start listen');

        this._srv = xmlrpc.createServer(
            { host : '0.0.0.0', port : this._local_port }, () => {
                log.info('RRCS Server listening');

                this._cl = xmlrpc.createClient(
                    { host : rrcs_host, port : rrcs_port });

                log.info(`Client connecting to ${rrcs_host}:${rrcs_port}`);

                this._load_cached();
                this._ping_artist();
            });

        this._srv.on('ConfigurationChange', (err, params, cb) => {
            if (err) {
                log.error('ConfigurationChange error: ' + err);
                return;
            }

            this._reset()
                .then(() => {
                    log.info('Artist reset after config change');
                    this.onArtistConfigurationChanged();
                })
                .catch(err => {
                    log.info('Failed to reset Artist ' + err);
                })

            cb(null, [ params[0] ]);
        });

        this._srv.on('XpVolumeChange', (err, params, cb) => {
            if (err) {
                log.error('XpVolumeChange error: ' + err);
                return;
            }

            this.onXpValueChanged(params[1][0], params[1][0].SingleVolume,
                                  params[1][0].ConferenceVolume);
            cb(null, [ params[0] ]);
        });

        this._srv.on('CrosspointChange', (err, params, cb) => {
            let xp_keys = Object.keys(params[2]);
            let out     = [];
            for (let key of xp_keys) {
                out.push({
                    xp : crosspointFromParams(params[2][key]),
                    state : <boolean>params[2][key][6]
                });
            }
            this.onXpsChanged(out);
            cb(null, [ params[0] ]);
        });
    }

    rrcsAvailable()
    {
    }

    getArtistNode(id: number)
    {
        return this._nodes.find(node => node.nodeID() == id);
    }

    getAllNodes(): ArtistNodeInfo[]
    {
        return this._nodes.map(node => {
            return {
                id: node.nodeID(), ports: node._ports.map(port => port.info)
            }
        });
    }

    getArtistState(): ArtistState
    {
        return {
            gateway : this._gateway_online,
            artist : this._artist_online,
            artist_nodes : this.getAllNodes()
        };
    }

    async getGatewayState()
    {
        return this._perform_method_call(
            'GetState',
            this._get_trs_key(),
        )
    }

    async setStateWorking()
    {
        return this._perform_method_call(
            'SetStateWorking', this._get_trs_key());
    }

    async setStateStandby()
    {
        return this._perform_method_call(
            'SetStateStandby', this._get_trs_key());
    }

    async getAlive()
    {
        return this._perform_method_call('GetAlive', this._get_trs_key());
    }

    async getArtistConnected()
    {
        let data = <any>await this._perform_method_call(
            'IsConnectedToArtist', this._get_trs_key());
        return <boolean>data.IsConnected;
    }

    async setXPVolume(xp: Crosspoint, volume: number, single?: boolean,
                      conf?: boolean)
    {
        log.debug(`Set XP volume (${
            (single == null) ? 'single'
                             : (single ? 'single' : 'conf')}) ${__xpid(xp)} - ${
            ((volume === 0) ? 'mute' : ((volume - 230) / 2) + 'dB')}`);

        this._perform_method_call(
            'SetXPVolume', this._get_trs_key(), ...crosspointToParams(xp, 2),
            (single == null) ? true : single, conf || false, volume);
    }

    async getXpStatus(xp: Crosspoint)
    {
        let resp = <any>await this._perform_method_call(
            'GetXpStatus', this._get_trs_key(), ...crosspointToParams(xp, 2));
        return <boolean>resp[2];
    }

    async getActiveXps()
    {
        let resp = <any>await this._perform_method_call(
            'GetAllActiveXps', this._get_trs_key());

        let out = [];

        for (let key of Object.keys(resp)) {
            if (key.startsWith('XP#'))
                out.push(crosspointFromParams(resp[key]))
        }
        return out;
    }

    async setXP(xp: Crosspoint)
    {
        log.debug(`Set XP ${__xpid(xp)}`);
        this._perform_method_call(
            'SetXp', this._get_trs_key(), ...crosspointToParams(xp, 2));
    }

    async killXP(xp: Crosspoint)
    {
        log.debug(`Kill XP ${__xpid(xp)}`);
        this._perform_method_call(
            'KillXp', this._get_trs_key(), ...crosspointToParams(xp, 2));
    }

    async _perform_method_call(method: string, ...params: any[])
    {
        logArtistCall(method, params.length);
        return new Promise((res, rej) => { this._cl.methodCall(
                               method, params, (err, value) => {
                                   if (err)
                                       rej(err);
                                   else {
                                       artlog.debug(`Call to ${method} returned with ${value.length} args`);
                                       res(value);
                                   }
                               }) });
    }

    private async _modify_notifications(method: string, ...args: any[])
    {
        return this._perform_method_call(method, this._get_trs_key(),
                                         this._local_ip, this._local_port,
                                         ...args);
    }

    private async _setup_notifications()
    {
        return this._modify_notifications('RegisterForEventsEx', {
            'XpVolumeChange' : true,
            'ConfigurationChange' : true,
            'XpChange' : true
        });
    }

    async resetXPVolNotifyRegistry()
    {
        return this._modify_notifications('XpVolumeChangeRegistryReset', []);
    }

    async addToXPVolNotifyRegistry(xps: Crosspoint[])
    {
        return this._modify_notifications('XpVolumeChangeRegistryAdd', xps);
    }

    async removeFromXPVolNotifyRegistry(xps: Crosspoint[])
    {
        return this._modify_notifications('XpVolumeChangeRegistryRemove', xps);
    }

    private _gateway_went_online()
    {
        this.emit('gateway-online');
    }

    private _gateway_went_offline()
    {
        this.emit('gateway-offline');
    }

    private _artist_went_online()
    {
        this._reset()
            .then(() => this.onArtistOnline())
            .then(() => {
                log.info('Artist initialized');
                this.emit('artist-online');
            })
            .catch(err => {
                log.warn('Could not initiaize Artist ' + err);
                this._artist_online = false;
            });
    }

    private _artist_went_offline()
    {
        this.emit('artist-offline');
    }

    private _begin_connect()
    {
        this._reset()
            .then(() => {
                log.info('Connected to Artist');
            })
            .catch(err => {
                log.error('Could not connect to artist ' + err);
                this._connect_retry_timeout
                    = setTimeout(this._begin_connect.bind(this), 5000);
            });
    }

    private _ping_artist()
    {
        this.getAlive()
            .then(() => this.getArtistConnected())
            .then((is_connected) => {
                if (!this._gateway_online) {
                    this._gateway_online = true;
                    this._gateway_went_online();
                }
                if (is_connected) {
                    if (!this._artist_online) {
                        log.info('Artist is online');
                        this._artist_online = true;
                        this._artist_went_online();
                    }
                }
                else {
                    log.debug('Gateway not connected to artist')
                    if (this._artist_online)
                    {
                        log.warn('Artist is offline');
                        this._artist_online = false;
                        this._artist_went_offline();
                    }
                }
                setTimeout(this._ping_artist.bind(this), 5000);
            })
            .catch(err => {
                if (this._gateway_online) {
                    this._gateway_online = false;
                    this._gateway_went_offline();
                }
                if (this._artist_online) {
                    log.warn('Artist is offline');
                    this._artist_online = false;
                    this._artist_went_offline();
                }
                setTimeout(this._ping_artist.bind(this), 5000);
            });
    }

    private async _reset()
    {
        await this.setStateWorking();
        await this._refresh_nodes();
        await this._setup_notifications();
        await this.resetXPVolNotifyRegistry();
        await this.addToXPVolNotifyRegistry(this.xpsToListenTo());
    }

    private async _refresh_nodes()
    {
        let data = <any[]>await this._perform_method_call(
            'GetAllPorts', this._get_trs_key());

        let ports = data[1];
        this._nodes.forEach(node => node.destroy());
        this._nodes = [];
        ports.forEach((port: ArtistPortInfo) => {
            // console.log(`input: ${port.Input} output: ${port.Output} -
            // ${port.Name}`);
            let node = this.getArtistNode(port.Node);
            if (node)
                node.addPort(port);
            else {
                log.info('Add artist node ' + port.Node);
                let new_node = new ArtistNode(this, port.Node);
                this._nodes.push(new_node);
                new_node.addPort(port);
            }
        });
        fs.writeFileSync(`${configFileDir('nodestate')}/artistcache.json`,
                         JSON.stringify(this.getArtistState()));
    }

    private _load_cached()
    {
        let cachefile = `${configFileDir('nodestate')}/artistcache.json`;
        if (!fs.existsSync(cachefile)) {
            log.info('Write initial cache file');
            fs.writeFileSync(cachefile, JSON.stringify(this.getArtistState()));
        }
        else {
            log.info('Load cache');
            let cache = <ArtistState>JSON.parse(
                fs.readFileSync(cachefile).toString());
            cache.artist_nodes.forEach(node => {
                this._nodes.push(new ArtistNode(this, node.id));
                node.ports.forEach(port => {
                    this._nodes[this._nodes.length - 1].addPort(port);
                });
            });
        }
    }

    private _get_trs_key()
    {
        return 'X' + pad(++this._trs_cnt, 10);
    }
}

export class RRCSService extends RRCSServer {

    _synced: Record<string, CrosspointSync> = {};

    xpsToListenTo(): Crosspoint[]
    {
        let ids = Object.keys(this._synced);
        let out = [];
        for (let id of ids)
            out.push(this._synced[id]);
        return out.map(xps => xps.master.xp);
    }

    setXPSyncs(syncs: CrosspointSync[])
    {
        this._synced = {};
        syncs.forEach(sync => {
            this._synced[xpvtid(sync.master)] = sync;
        });

        this.resetXPVolNotifyRegistry()
            .then(() => this.addToXPVolNotifyRegistry(this.xpsToListenTo()))
            .then(() => this.refreshAllXPs())
            .catch(err => {
                log.error('Could not set XP syncs ' + err);
            })
    }

    newXPSync(master: CrosspointVolumeSource, slaves: CrosspointVolumeTarget[])
    {
        let id           = xpvtid(master);
        this._synced[id] = { vol : 230, state : false, master, slaves };

        if (this._gateway_online) {
            this.addToXPVolNotifyRegistry([ master.xp ])
                .then(() => this.updateStateForCrosspointSync(this._synced[id]))
                .catch(err => {
                    log.error(
                        'Could not add new crosspoint to notification registry: '
                        + err);
                });
        }
    }

    addXPSync(master: CrosspointVolumeSource, slaves: CrosspointVolumeTarget[])
    {
        let masterid = xpvtid(master);
        if (this._synced[masterid]) {
            slaves.forEach(sl => {
                if (this._synced[masterid].slaves.findIndex(
                        lslave => xpVtEqual(lslave, sl))
                    == -1) {
                    log.info(
                        `Add new sync target ${__xpid(sl.xp)} to ${masterid}`);
                    this._synced[masterid].slaves.push(sl);
                    this.updateCrosspoint(sl, this._synced[masterid].vol);
                }
            });
        }
        else {
            log.verbose('Add new crosspoint sync ' + masterid);
            this.newXPSync(master, slaves);
        }
    }

    getAllXPStates()
    {
        let out = <CrosspointVolumeSourceState[]>[];
        for (let key of Object.keys(this._synced))
            out.push({
                xpid : xpvtid(this._synced[key].master),
                state : this._synced[key].state
            });
    }

    async updateStateForCrosspointSync(sync: CrosspointSync)
    {
        let state = await this.getXpStatus(sync.master.xp);
        sync.state = state;
        this.emit('xp-states-changed', [<CrosspointVolumeSourceState> { state, xpid: xpvtid(sync.master) }]);
    }

    updateCrosspoint(xpv: CrosspointVolumeTarget, vol: number)
    {
        this.setXPVolume(xpv.xp, vol, xpv.single, xpv.conf);
    }

    async onArtistOnline()
    {
        let activexps = await this.getActiveXps();
        // activexps.forEach(xp => { this })
    }

    onArtistConfigurationChanged(): void
    {
        this.getActiveXps();
        this.emit('config-changed');
    }

    onXpValueChanged(crosspoint: Crosspoint, single: number, conf: number)
    {
        let mid_single = xpvtid({ conf : false, xp : crosspoint });
        let mid_conf   = xpvtid({ conf : true, xp : crosspoint });

        if (this._synced[mid_single] && single != null) {
            this._do_update_xp(this._synced[mid_single], single);
            this.emit('xp-value-change', { xp : mid_single, value : single });
        }

        if (this._synced[mid_conf] && conf != null) {
            this._do_update_xp(this._synced[mid_conf], conf);
            this.emit('xp-value-change', { xp : mid_conf, value : conf });
        }
    }

    onXpsChanged(xps: CrosspointState[])
    {
        let updated = <CrosspointVolumeSourceState[]> [];
        for (let xpstate of xps) {
            let masterid_conf   = xpvtid({ xp : xpstate.xp, conf : false });
            let masterid_single = xpvtid({ xp : xpstate.xp, conf : true });

            if (this._synced[masterid_conf]){
                this.syncCrosspointsForMaster(
                    this._synced[masterid_conf], xpstate.state);
                updated.push({ xpid: masterid_conf, state: xpstate.state });
            }

            if (this._synced[masterid_single]){
                this.syncCrosspointsForMaster(
                    this._synced[masterid_single], xpstate.state);
                updated.push({ xpid: masterid_single, state: xpstate.state });
            }
        }
        if(updated.length) {
            this.emit('xp-states-changed', updated);
        }
    }

    async syncCrosspointsForMaster(sync: CrosspointSync, state: boolean)
    {
        for (let slave of sync.slaves) {
            if (slave.set) {
                try {
                    if (state)
                        await this.setXP(slave.xp)
                        else await this.killXP(slave.xp);
                }
                catch (err) {
                    log.error('Could not set XP ' + err);
                }
            }
        }
    }

    async refreshAllXPs()
    {
        let xps = await this.getActiveXps();

        this._clear_all_xpstates();

        xps.forEach(xp => {
            let singleid = xpvtid({ xp, conf : false });
            let confid   = xpvtid({ xp, conf : true });

            if (this._synced[singleid])
                this._synced[singleid].state = true;

            if (this._synced[confid])
                this._synced[confid].state = true;
        });

        let syncstates = <CrosspointVolumeSourceState[]> []
        for (let key of Object.keys(this._synced))
            syncstates.push({ xpid: xpvtid(this._synced[key].master), state: this._synced[key].state });
        
        this.emit('xp-states-changed', syncstates);
    }

    private _do_update_xp(sync: CrosspointSync, vol: number)
    {
        sync.vol = vol;
        sync.slaves.forEach(slave => {
            try {
                this.updateCrosspoint(slave, sync.vol);
            }
            catch (err) {
                log.error('Could not update crosspoint: ' + err);
            }
        });
    }

    private _clear_all_xpstates()
    {
        for (let key of Object.keys(this._synced))
            this._synced[key].state = false;
    }
}


/*
export class RRCSModule extends ServerModule {

    rrcssrv: RRCSServerType;
    local_sock: Socket;
    config: any;

    init()
    {
        this.handleGlobalWebInterfaceEvent('reconnect-rrcs', (socket, data) => {
            log.info('Reconnect RRCS');
            this.reconnectRRCS();
        });
    }

    joined(socket: SocketIO.Socket)
    {
    }

    left(socket: SocketIO.Socket)
    {
    }

    constructor(config: any)
    {
        super('rrcs');
        this.config = config;

        this.local_sock = createSocket('udp4', (msg, rinfo) => {

                                               });

        this.local_sock.on('error', (err) => {
            log.error('RRCS to OSC socket error: ' + err);
        });

        this.local_sock.on('close', () => {
            log.warn('RRCS to OSC socket closed');
        });
        // this.reconnectRRCS();
    }

    reconnectRRCS()
    {
        if (this.config) {
            if (this.rrcssrv) {
                this.rrcssrv.server.httpServer.close();
                this.rrcssrv.server.httpServer.on('close', () => {
                    log.warn('RRCS Server closed');
                    this.startRRCS();
                });
            }
            else
                this.startRRCS();
        }
    }

    startRRCS()
    {
    }

    processOSCCommand(cmd: string[])
    {
        let ccmd = cmd[0].split(' ');
        let addr = ccmd.shift();
        let msg: OSCMessage
            = { address : addr, oscType : 'message', args : [] }

              ccmd.forEach(arg => {
                  try {
                      if (/^\d+$/.test(arg)) {
                          msg.args.push({
                              type : 'integer',
                              value : Number.parseInt(arg)
                          });
                      }
                      else if (!isNaN(<number><unknown>arg)) {
                          msg.args.push({
                              type : 'float',
                              value : Number.parseFloat(arg)
                          });
                      }
                      else {
                          msg.args.push({ type : 'string', value : arg });
                      }
                  }
                  catch (err) {
                      log.error('Could not convert arg to OSC Type ' + err);
                  }

                  this.local_sock.send(toBuffer(msg), this.config.rrcs_osc_port,
                                       this.config.rrcs_osc_host);
              });
    }

    processStringCommand(str: string)
    {
        let cmd = str.split('-');

        switch (cmd.shift()) {
            case 'headtracker': this.processHeadtrackerCommand(cmd); break;
            case 'osc': this.processOSCCommand(cmd);
        }
    }

    processHeadtrackerCommand(cmd: string[])
    {
        let id = Number.parseInt(cmd[1]);
        switch (cmd.shift()) {
            case 'reset':
                this.events.emit(HeadtrackerInputEvents.RESET_HEADTRACKER, id);
                break;
            case 'init':
                this.events.emit(HeadtrackerInputEvents.CALIBRATE_STEP1, id);
                break;
            case 'on':
                this.events.emit(HeadtrackerInputEvents.HEADTRACKER_ON, id);
                break;
            case 'off':
                this.events.emit(HeadtrackerInputEvents.HEADTRACKER_OFF, id);
        }
    }

    processHeadtrackerOffCommand(cmd: string[])
    {
        let id = Number.parseInt(cmd[1]);
        switch (cmd.shift()) {
            case 'init':
                this.events.emit(HeadtrackerInputEvents.CALIBRATE_STEP2, id);
                break;
        }
    }

    processStringOffCommand(str: string)
    {
        let cmd = str.split('-');

        switch (cmd.shift()) {
            case 'headtracker': this.processHeadtrackerOffCommand(cmd); break;
        }
    }


    initial(msg: any, error: any)
    {
        this.webif.broadcastNotification('RRCS', msg);
        if (error)
            console.log(error);
    }
    log(msg: any)
    {
        if (this.webif)
            this.webif.broadcastNotification('RRCS', msg);
        log.info(msg);
    }
    error(err: any)
    {
        log.error(err);
    }
    getAlive(msg: any)
    {
        return true;
    }
    crosspointChange(params: any)
    {
        console.log(params);
    }
    sendString(params: any)
    {
        try {
            this.processStringCommand(params[1]);
        }
        catch (err) {
            log.error(`Could not process string command from artist: ` + err);
        }
    }
    sendStringOff(params: any)
    {
        try {
            this.processStringOffCommand(params[1]);
        }
        catch (err) {
            log.error(`Could not process string-off command from artist: `
                      + err);
        }
    }
    gpInputChange(params: any)
    {
    }
    logicSourceChange(params: any)
    {
    }
    configurationChange(params: any)
    {
    }
    upstreamFailed(params: any)
    {
    }
    upstreamFaieldCleared(params: any)
    {
    }
    downstreamFailed(params: any)
    {
    }
    downstreamFailedCleared(params: any)
    {
    }
    nodeControllerFailed(params: any)
    {
    }
    nodeControllerReboot(params: any)
    {
    }
    clientFailed(params: any)
    {
    }
    clientFailedCleared(params: any)
    {
    }
    portInactive(params: any)
    {
    }
    portActive(params: any)
    {
    }
    connectArtistRestored(params: any)
    {
    }
    connectArtistFailed(params: any)
    {
    }
    gatewayShutdown(params: any)
    {
    }
    notFound(params: any)
    {
    }
}
*/

/*
this._srv.on('XpVolumeChange', (err, params, cb) => {
    console.log(params);

    this._cl.methodCall('SetXPVolume', [this._get_trs_key(), 1, 6, 24, 1, 6, 25,
true, false, params[1][0].SingleVolume], (err, params) => { console.log(err);
        console.log(params);
    })

    cb(null, [params[0]]);
});

this._srv.on('ConfigurationChange', (err, params, cb) => {
    cb(null, [params[0]]);
})

this._cl.methodCall('RegisterForEventsEx', [this._get_trs_key(),
"192.168.178.91", this._local_port, { "XpVolumeChange": true,
"ConfigurationChange": true }], (err, val) => { console.log(err);
    console.log(val);

    this._cl.methodCall('XpVolumeChangeRegistryReset', [this._get_trs_key(),
"192.168.178.91", this._local_port, []], (err, val) => { console.log(err);
        console.log(val);
        this._cl.methodCall('XpVolumeChangeRegistryAdd', [this._get_trs_key(),
"192.168.178.91", this._local_port, [{ Destination: { Node: 2, Port: 48,
IsInput: false }, Source: { Node: 2, Port: 50, IsInput: true } }]], (err, val)
=> { console.log(err); console.log(val);
        });
    });
})
*/