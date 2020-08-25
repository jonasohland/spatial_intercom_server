import {ValidateFunction} from 'ajv';

import {Connection, NodeIdentification, Requester} from './communication';
import {
    ManagedNodeStateMapRegister,
    ManagedNodeStateObject,
    Node,
    NodeModule,
    ServerModule
} from './core';
import * as Logger from './log';
import {
    ArtistState,

} from './rrcs';
import {
    __xpid,
    AddCrosspointVolumeTargetMessage,
    CrosspointSync,
    CrosspointVolumeSourceState,
    CrosspointVolumeTarget,
    xpEqual,
    XPSyncModifySlavesMessage,
    xpvtid,
} from './rrcs_defs';
import {ignore} from './util';
import * as Validation from './validation';

const log = Logger.get('RRCSMD');

class Sync extends ManagedNodeStateObject<CrosspointSync> {

    data: CrosspointSync;
    remote: Requester;

    constructor(sync: CrosspointSync, remote: Requester)
    {
        super();
        this.remote = remote;
        this.data   = sync;
    }

    addSlaves(slvs: CrosspointVolumeTarget[])
    {
        slvs.forEach(slv => {
            if (this.data.slaves.find(s => xpEqual(s.xp, slv.xp)) == null) {
                log.debug(`Add slave xp ${__xpid(slv.xp)}`);
                this.data.slaves.push(slv);
            }
        });
    }

    removeSlaves(slvs: CrosspointVolumeTarget[])
    {
        slvs.forEach(slv => {
            let idx = this.data.slaves.findIndex(s => xpEqual(s.xp, slv.xp));
            if (idx != -1) {
                log.debug(`Remove slave xp ${__xpid(slv.xp)}`);
                this.data.slaves.splice(idx, 1);
            }
        });
    }

    setState(state: boolean)
    {
        this.data.state = state;
    }

    async set(val: any)
    {
        this.data = val;
    }

    get()
    {
        return this.data;
    }
}

class SyncList extends ManagedNodeStateMapRegister {

    remote: Requester;

    setRemote(remote: Requester)
    {
        this.remote = remote;
        this._object_iter().forEach((obj: Sync) => {
            obj.remote = remote;
        });
    }

    async remove(name: string, obj: ManagedNodeStateObject<any>)
    {
        if (this.remote) {
            await this.remote.set('remove-xp-sync', name);
        }
        else
            log.warn(`Could not remove ${name} not connected to remote`);
    }

    async insert(name: string, obj: any)
    {
        return new Sync(obj, this.remote);
    }

    allSyncs()
    {
        return <CrosspointSync[]>this._object_iter().map(obj => obj.get());
    }

    getSyncForMaster(sync: CrosspointSync|string)
    {
        if (typeof sync === 'string')
            return this._objects[sync];
        else
            return this._objects[xpvtid(sync.master)]
    }

    async removeMaster(id: string)
    {
        if (this.contains(id))
            await this.removeObject(id);
    }
}

class RRCSNodeModule extends NodeModule {

    rrcs: Requester;
    syncs: SyncList;
    _xpstates: Record<string, boolean>;
    _cached: ArtistState;

    constructor()
    {
        super('rrcs');
        this.syncs = new SyncList();
        this.add(this.syncs, 'syncs');
    }

    init()
    {
    }

    addXpSync(sync: CrosspointSync)
    {
        let existing = <Sync>this.syncs.getSyncForMaster(sync);

        if (existing) {
            existing.addSlaves(sync.slaves);
            existing.save().catch(err => 'Could not update node ' + err);
        }
        else {
            this.syncs.add(xpvtid(sync.master), new Sync(sync, this.rrcs));
            this.syncs.save().catch(err => 'Could not update node ' + err);
        }

        this._webif_update_sync_list();

        this.rrcs.set('add-xp-sync', sync)
            .then(resp => {
                ignore(resp);
                this._server._webif.broadcastNotification(
                    'RRCS', 'Added new XPSync');
            })
            .catch(err => {
                this._server._webif.broadcastError(
                    'RRCS', 'Failed to add new XPSync ' + err);
            });
    }

    removeXPSync(id: string)
    {
        if (this.syncs.contains(id)) {
            this.syncs.removeMaster(id)
                .then(() => this.syncs.save())
                .then(() => {
                    this._webif_update_sync_list();
                })
                .catch(err => {
                    log.error(`Could not remove sync ${id}: ${err}`);
                });
        }
    }

    addSlaveToSync(msg: AddCrosspointVolumeTargetMessage)
    {
        let mastersync = <Sync>this.syncs.getSyncForMaster(msg.masterid);
        if (mastersync) {
            mastersync.addSlaves([ msg.slave ]);
            mastersync.save().catch(
                err => log.error(`Could not write data to node ${err}`));
            this._webif_update_sync_list();
            this.rrcs
                .set('xp-sync-add-slaves', <XPSyncModifySlavesMessage>{
                    master : msg.masterid,
                    slaves : [ msg.slave ]
                })
                .catch(err => {
                    log.error(`Could not write changes to rrcs ${err}`);
                });
        }
    }

    removeSlaveFromSync(msg: AddCrosspointVolumeTargetMessage)
    {
        let mastersync = <Sync>this.syncs.getSyncForMaster(msg.masterid);
        if (mastersync) {
            mastersync.removeSlaves([ msg.slave ]);
            mastersync.save().catch(
                err => log.error(`Could not write data to node ${err}`));
            this._webif_update_sync_list();
            this.rrcs
                .set('xp-sync-remove-slaves', <XPSyncModifySlavesMessage>{
                    master : msg.masterid,
                    slaves : [ msg.slave ]
                })
                .catch(err => {
                    log.error(`Could not write changes to rrcs ${err}`);
                });
        }
    }

    start(remote: Connection)
    {
        this.rrcs = remote.getRequester('rrcs');
        this.syncs.setRemote(this.rrcs);

        this.save().catch(err => {
            log.error('Could write data to node ' + err);
        });

        this.rrcs.on('artist-online', this._artist_online.bind(this));
        this.rrcs.on('artist-offline', this._artist_offline.bind(this));
        this.rrcs.on('gateway-online', this._gateway_online.bind(this));
        this.rrcs.on('gateway-offline', this._gateway_offline.bind(this));
        this.rrcs.on('config-changed', this._config_changed.bind(this));
        this.rrcs.on('xp-states-changed', this._xp_states_changed.bind(this));

        this._reload_artist_state();
        this._set_sync_list();
    }

    joined(socket: SocketIO.Socket, topic: string)
    {
        socket.emit(`${this.myNodeId()}.rrcs.artists`, this._cached);
        socket.emit(`${this.myNodeId()}.rrcs.syncs`, this.syncs.allSyncs());
    }

    left(socket: SocketIO.Socket, topic: string)
    {
    }

    destroy()
    {
    }

    _artist_online()
    {
        this._server._webif.broadcastNotification('RRCS', 'Artist online');
        this._reload_artist_state();
        this._cached.artist = true;
        this._webif_update_connection();
    }

    _artist_offline()
    {
        this._server._webif.broadcastError('RRCS', 'Artist offline');
        this._cached.artist = false;
        this._webif_update_connection();
    }

    _gateway_online()
    {
        this._server._webif.broadcastNotification(
            'RRCS', 'RRCS Gateway online');
        this._cached.gateway = true;
        this._webif_update_connection();
    }

    _gateway_offline()
    {
        this._server._webif.broadcastError('RRCS', 'RRCS Gateway offline');
        this._cached.gateway = false;
        this._webif_update_connection();
    }

    _config_changed()
    {
        this._server._webif.broadcastWarning(
            'RRCS', 'Artist configuration changed');
        this._reload_artist_state();
    }

    _xp_states_changed(msg: any)
    {
        let states = <CrosspointVolumeSourceState[]>msg.data;

        states.forEach(state => {
            let sync = <Sync>this.syncs.getSyncForMaster(state.xpid);
            if (sync)
                sync.setState(state.state);
        });

        this.publish('all', `${this.myNodeId()}.rrcs.xps`, states);
    }

    _reload_artist_state()
    {
        this.rrcs.request('state')
            .then(msg => {
                this._cached = <ArtistState>msg.data;
                this.publish(
                    'all', `${this.myNodeId()}.rrcs.artists`, this._cached);
            })
            .catch(err => {
                log.error(`Could not load artist state: ${err}`);
            })
    }

    _set_sync_list()
    {
        this.rrcs.set('xp-syncs', this.syncs.allSyncs())
    }

    _webif_update_sync_list()
    {
        this.publish(
            'all', `${this.myNodeId()}.rrcs.syncs`, this.syncs.allSyncs());
    }

    _webif_update_connection()
    {
        this.publish('all', `${this.myNodeId()}.rrcs.connection`,
                     this._cached.gateway, this._cached.artist);
    }
}

export class RRCSServerModule extends ServerModule {

    validate_xpsync: ValidateFunction;
    validate_add_xpvt_msg: ValidateFunction;

    constructor()
    {
        super('rrcs');
        this.validate_xpsync
            = Validation.getValidator(Validation.Validators.CrosspointSync);

        this.validate_add_xpvt_msg = Validation.getValidator(
            Validation.Validators.AddCrosspointVolumeTargetMessage);
    }

    init()
    {
        this.handleWebInterfaceEvent(
            'add-xp-sync', (socket, node: RRCSNode, data: CrosspointSync) => {
                if (this.validate_xpsync(data))
                    node.rrcs.addXpSync(data);
                else
                    this.server._webif.broadcastError(
                        'RRCS', 'Could not add new XPSync: missing data');
            });

        this.handleWebInterfaceEvent(
            'xp-add-slave', (socket, node: RRCSNode,
                             data: AddCrosspointVolumeTargetMessage) => {
                if (this.validate_add_xpvt_msg(data))
                    node.rrcs.addSlaveToSync(data);
                else
                    this.server._webif.broadcastError(
                        'RRCS', 'Could not add new XPSync slave: missing data');
            });

        this.handleWebInterfaceEvent(
            'xp-remove-slave', (socket, node: RRCSNode,
                                data: AddCrosspointVolumeTargetMessage) => {
                if (this.validate_add_xpvt_msg(data))
                    node.rrcs.removeSlaveFromSync(data);
                else
                    this.server._webif.broadcastError(
                        'RRCS', 'Could not remove XPSync slave: missing data');
            });

        this.handleWebInterfaceEvent(
            'remove-xp-sync', (socket, node: RRCSNode, data: string) => {
                node.rrcs.removeXPSync(data);
            });
    }

    joined(socket: SocketIO.Socket, topic: string)
    {
    }

    left(socket: SocketIO.Socket, topic: string)
    {
    }
}

export class RRCSNode extends Node {

    rrcs: RRCSNodeModule;

    constructor(id: NodeIdentification)
    {
        super(id);

        this.rrcs = new RRCSNodeModule();
        this.add(this.rrcs);
    }

    init(): void
    {
    }

    start(): void
    {
    }

    destroy(): void
    {
    }
}