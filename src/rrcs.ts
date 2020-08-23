import {EventEmitter2} from 'eventemitter2';
import * as fs from 'fs';
import xmlrpc from 'xmlrpc';

import {configFileDir} from './files';
import * as Logger from './log';
import {
    __xpid,
    Crosspoint,
    CrosspointState,
    CrosspointSync,
    CrosspointVolumeSource,
    CrosspointVolumeSourceState,
    CrosspointVolumeTarget,
    destinationPortIsWildcard,
    isLoopbackXP,
    isWildcardXP,
    portEqual,
    sourcePortIsWildcard,
    withDestinationAsDestinationWildcard,
    withDestinationeAsSourceWildcard,
    withSourceAsDestinationWildcard,
    withSourceAsSourceWildcard,
    xpEqual,
    XPSyncModifySlavesMessage,
    xpVtEqual,
    xpvtid
} from './rrcs_defs';

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
        net - 1, xp.Source.Node, xp.Source.Port, net - 1, xp.Destination.Node,
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

    async getXpsInRange(xp: Crosspoint)
    {
        let resp = <any>await this._perform_method_call(
            'GetActiveXpsRange', this._get_trs_key(),
            ...crosspointToParams(xp, 2));

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
        return new Promise(
            (res,
             rej) => { this._cl.methodCall(method, params, (err, value) => {
                if (err)
                    rej(err);
                else {
                    artlog.debug(
                        `Call to ${method} returned with ${value.length} args`);
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
        xps = xps.filter(xp => !isWildcardXP(xp));
        if (xps.length)
            return this._modify_notifications('XpVolumeChangeRegistryAdd', xps);
    }

    async removeFromXPVolNotifyRegistry(xps: Crosspoint[])
    {
        xps = xps.filter(xp => !isWildcardXP(xp));
        if (xps.length)
            return this._modify_notifications(
                'XpVolumeChangeRegistryRemove', xps);
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

    xpSyncAddSlaves(msg: XPSyncModifySlavesMessage)
    {
    }

    xpSyncRemoveSlaves(msg: XPSyncModifySlavesMessage)
    {
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
        let state  = await this.getXpStatus(sync.master.xp);
        sync.state = state;
        this.emit('xp-states-changed', [
            <CrosspointVolumeSourceState>{ state, xpid : xpvtid(sync.master) }
        ]);
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

    async onXpsChanged(xps: CrosspointState[])
    {
        let updated = <CrosspointVolumeSourceState[]>[];
        for (let xpstate of xps) {

            // ignore the Sidetone/Loopback XP
            if (isLoopbackXP(xpstate.xp))
                continue;

            this.trySyncCrosspointForMaster(
                xpvtid({ xp : xpstate.xp, conf : false }), xpstate, updated);
            this.trySyncCrosspointForMaster(
                xpvtid({ xp : xpstate.xp, conf : true }), xpstate, updated);

            await this.trySyncCrosspointForWildcardMaster(
                xpvtid({
                    xp : withDestinationAsDestinationWildcard(xpstate.xp),
                    conf : false
                }),
                xpstate, updated);

            await this.trySyncCrosspointForWildcardMaster(
                xpvtid({
                    xp : withDestinationeAsSourceWildcard(xpstate.xp),
                    conf : false
                }),
                xpstate, updated);

            await this.trySyncCrosspointForWildcardMaster(
                xpvtid({
                    xp : withSourceAsDestinationWildcard(xpstate.xp),
                    conf : false
                }),
                xpstate, updated);

            await this.trySyncCrosspointForWildcardMaster(
                xpvtid({
                    xp : withSourceAsSourceWildcard(xpstate.xp),
                    conf : false
                }),
                xpstate, updated);
        }
        if (updated.length) {
            this.emit('xp-states-changed', updated);
        }
    }

    trySyncCrosspointForMaster(masterid: string, xpstate: CrosspointState,
                               updated: CrosspointVolumeSourceState[])
    {
        if (this._synced[masterid]) {
            this.syncCrosspointsForMaster(
                this._synced[masterid], xpstate.state);
            updated.push({ xpid : masterid, state : xpstate.state });
        }
    }

    async trySyncCrosspointForWildcardMaster(masterid: string,
                                             xpstate: CrosspointState,
                                             updated:
                                                 CrosspointVolumeSourceState[])
    {
        try {
            if (this._synced[masterid]) {
                if (await this.syncCrosspointsForWildcardMaster(
                        this._synced[masterid], xpstate.state)) {
                    updated.push({
                        xpid : masterid,
                        state : this._synced[masterid].state
                    });

                    for (let slave of this._synced[masterid].slaves) {
                        if (slave.set) {
                            if (this._synced[masterid].state)
                                await this._try_set_xp(slave.xp);
                            else
                                await this._try_kill_xp(slave.xp);
                        }
                    }
                }
            }
        }
        catch (err) {
            log.error(`Failed to update wildcard master ${masterid}: ${err}`);
        }
    }

    async syncCrosspointsForMaster(sync: CrosspointSync, state: boolean)
    {
        sync.state = state;
        for (let slave of sync.slaves) {
            if (slave.set) {
                try {
                    if (state)
                        await this._try_set_xp(slave.xp);
                    else
                        await this._try_kill_xp(slave.xp);
                }
                catch (err) {
                    log.error('Could not set XP ' + err);
                }
            }
        }
    }

    async syncCrosspointsForWildcardMaster(sync: CrosspointSync,
                                           newstate: boolean)
    {
        let wildcard_actives = <Crosspoint[]>[];

        if (destinationPortIsWildcard(sync.master.xp)) {

            let xps = await this.getXpsInRange({
                Source : sync.master.xp.Source,
                Destination : sync.master.xp.Source
            });
            wildcard_actives.push(
                ...xps.filter(xp => portEqual(xp.Source, sync.master.xp.Source)
                                    && !isLoopbackXP(xp)));
        }

        if (sourcePortIsWildcard(sync.master.xp)) {
            let xps = await this.getXpsInRange({
                Source : sync.master.xp.Destination,
                Destination : sync.master.xp.Destination
            });

            wildcard_actives.push(...xps.filter(
                xp => portEqual(xp.Destination, sync.master.xp.Destination)
                      && !isLoopbackXP(xp)));
        }

        if (wildcard_actives.length) {
            log.debug(`Wildcard master ${xpvtid(sync.master)} still has ${
                wildcard_actives.length} XPs`);
            if (!sync.state) {
                sync.state = true;
                return true;
            }
            return false;
        }
        else {
            log.debug(
                `Wildcard master ${xpvtid(sync.master)} has no more active XPs`)
            if (sync.state)
            {
                sync.state = false;
                return true;
            }
            return false;
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

        let syncstates = <CrosspointVolumeSourceState[]>[];
        for (let key of Object.keys(this._synced))
            syncstates.push({
                xpid : xpvtid(this._synced[key].master),
                state : this._synced[key].state
            });

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

    private async _try_set_xp(xp: Crosspoint)
    {
        let isset = await this.getXpStatus(xp);
        if (isset)
            log.debug(`XP ${__xpid(xp)} already set`);
        else
            await this.setXP(xp);
    }

    private async _try_kill_xp(xp: Crosspoint)
    {
        log.debug(`Try killing XP ${__xpid(xp)}`);
        let still_set_by = <string[]>[];

        for (let masterid of Object.keys(this._synced)) {
            const sync  = this._synced[masterid];
            let slfound = false;

            if (!sync.state)
                continue;

            for (let slave of sync.slaves) {
                if (!slave.set)
                    continue;

                if (xpEqual(xp, slave.xp)) {
                    still_set_by.push(masterid)
                    slfound = true;
                    break;
                }
            }

            if (slfound)
                break;
        }

        if (still_set_by.length) {
            log.debug(`Wont kill XP because it is still set by ${
                still_set_by.length} masters`);
            still_set_by.forEach(mid => log.debug(`    still set by: ${mid}`));
        }
        else {
            try {
                await this.killXP(xp);
            }
            catch (err) {
                log.error(`Failed to kill XP ${__xpid(xp)}: ${err}`);
            }
        }
    }
}

/*
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
*/