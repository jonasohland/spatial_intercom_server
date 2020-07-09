import {EventEmitter} from 'events';
import * as fs from 'fs';
import safe_filename from 'sanitize-filename';
import {v4 as uniqueId} from 'uuid';

import {
    Connection,
    Message,
    NODE_TYPE,
    NodeIdentification,
    NodeMessageInterceptor,
    Requester,
    SIServerWSServer,
    SIServerWSSession
} from './communication';
import {configFileDir} from './files';
import * as Logger from './log';
import {ignore} from './util';
import WebInterface from './web_interface';
import node_mode from './node_mode';

const log = Logger.get('NSTATE');

export enum StateUpdateStrategy {
    /**
     * Overwrites everything and removes everything not present in incoming
     * data
     */
    OVERWRITE,

    /**
     * Updates existing references and removes everything not present in
     * incoming data
     */
    SYNC,

    /** Updates existing references and does not remove anything */
    MERGE,

    /** Only update existing references */
    PICK
}

/**
 * Contains the state data of a single object.
 * Uniquely identifiable by its object_id troughout its lifetime.
 */
export interface ManagedNodeStateObjectData {
    object_id: string, uid: string, data: any
}

/**
 * Base interface for a single register that stores some state of a module
 */
export interface ManagedNodeStateRegisterData {
    name: string, uid: string, map: boolean
}

/**
 * Raw data for a register type that stores its data in a simple list
 */
export interface ManagedNodeStateListRegisterData extends
    ManagedNodeStateRegisterData {
    objects: ManagedNodeStateObjectData[];
}

/**
 * Raw data for a register type that stores its data in a map
 */
export interface ManagedNodeStateMapRegisterData extends
    ManagedNodeStateRegisterData {
    objects: Record<string, ManagedNodeStateObjectData>;
}

/**
 * Raw node state data
 */
export interface ManagedNodeStateModuleData {
    name: string, uid: string, raw: any,
        registers: ManagedNodeStateRegisterData[]
}

export interface ObjectReference {
    name?: string, oid: string, uid: string
}

export interface RegisterReference {
    uid: string;
    name: string;
    map: boolean;
    objects: ObjectReference[]
}
/**
 * Map for all state-ids of a module
 */
export interface ModuleReference {
    uid: string, name: string, registers?: RegisterReference[]
}

export abstract class ManagedNodeStateObject<EncapsulatedType extends any> {

    _uid: string;
    _oid: string;
    _dirty: boolean;
    _name: string;
    _parent: ManagedNodeStateRegister;

    abstract async set(val: EncapsulatedType): Promise<void>;
    abstract async get(): Promise<EncapsulatedType>;

    init(parent: ManagedNodeStateRegister)
    {
        this._oid    = uniqueId();
        this._uid    = uniqueId();
        this._parent = parent;
    }

    async _export()
    {
        return <ManagedNodeStateObjectData>
        {
            object_id: this._oid, name: this._name, uid: this._uid,
                data: await this.get()
        }
    }

    async save(): Promise<Message>
    {
        return this._parent._save_child(this);
    }

    _map()
    {
        return { oid : this._oid, uid : this._uid, name : this._name };
    }

    modify()
    {
        this._dirty = true;
        this._uid   = uniqueId();
    }

    _clear()
    {
        this._dirty = false;
    }
}

export abstract class ManagedNodeStateRegister {

    _name: string;
    _uid: string;
    _dirty: boolean;
    _is_map: boolean;
    _parent: NodeModule;

    init(name: string, parent: NodeModule)
    {
        this._name   = name;
        this._uid    = uniqueId();
        this._parent = parent;
    }

    async _wrap_set(data: ManagedNodeStateObjectData,
                    obj: ManagedNodeStateObject<any>)
    {
        obj._uid = data.uid;
        return obj.set(data.data);
    }

    _object_iter(): ManagedNodeStateObject<any>[]
    {
        if (this._is_map) {
            let self = <ManagedNodeStateMapRegister><unknown>this;
            return Object.keys(self._objects).map(key => self._objects[key]);
        }
        else {
            let self = <ManagedNodeStateListRegister><unknown>this;
            return self._objects;
        }
    }

    async _export()
    {
        if (this._is_map) {
            let objects: Record<string, ManagedNodeStateObjectData> = {};

            for (let object of this._object_iter())
                objects[object._name] = await object._export();

            return <ManagedNodeStateRegisterData>{
                name : this._name,
                uid : this._uid,
                map : this._is_map,
                objects
            };
        }
        else {
            return <ManagedNodeStateListRegisterData>{
                name : this._name,
                uid : this._uid,
                map : this._is_map,
                objects : await Promise.all(
                    this._object_iter().map(obj => obj._export()))
            };
        }
    }

    _map()
    {
        return {
            uid : this._uid,
            name : this._name,
            map : this._is_map,
            objects : this._object_iter().map(o => o._map())
        };
    }

    modify()
    {
        this._dirty = true;
        this._uid   = uniqueId();
    }

    _clear()
    {
        this._dirty = false;
    }

    async _save_child(obj: ManagedNodeStateObject<any>)
    {
        return this._parent._save_child(this, obj);
    }

    async save()
    {
        return this._parent._save_child(this);
    }

    async _restore(s: ManagedNodeStateRegisterData,
                   strategy: StateUpdateStrategy)
    {
        log.debug('Restoring data for register ' + this._name);
        if (this._is_map) {
            let self = <ManagedNodeStateMapRegister><unknown>this;
            return self._restore_map(s, strategy);
        }
        else {
            let self = <ManagedNodeStateListRegister><unknown>this;
            return self._update_list(s, strategy);
        }
    }

    async applyObjectData(obj: ManagedNodeStateObjectData, name?: string)
    {
        if (this._is_map) {
            let self      = <ManagedNodeStateMapRegister><unknown>this;
            let local_obj = self._objects[name];
        }
    }
}

export abstract class ManagedNodeStateMapRegister extends
    ManagedNodeStateRegister {
    _objects: Record<string, ManagedNodeStateObject<any>> = {};

    constructor()
    {
        super();
        this._is_map = true;
    }

    abstract async remove(name: string,
                          obj: ManagedNodeStateObject<any>): Promise<void>;
    abstract async insert(name: string, obj: ManagedNodeStateObjectData):
        Promise<ManagedNodeStateObject<any>>;

    async _wrap_insert(name: string, obj: ManagedNodeStateObjectData)
    {
        let ob   = await this.insert(name, obj)
        ob._uid  = obj.uid;
        ob._oid  = obj.object_id;
        ob._name = (<any>obj).name
        return ob;
    }

    async _wrap_remove(name: string, obj: ManagedNodeStateObject<any>)
    {
        // log.debug(`Removing object [${obj.constructor.name}] ${name} from
        // ${this._name}`);
        delete this._objects[name];
        return this.remove(name, obj);
    }

    async insertExt(name: string, data: ManagedNodeStateObjectData)
    {
        this._objects[name] = await this._wrap_insert(name, data);
    }

    async _restore_map(s: ManagedNodeStateRegisterData,
                       strategy: StateUpdateStrategy)
    {
        if (!s.map)
            throw 'Did not expect list data in register ' + this._name;

        log.debug('Updating map data in register ' + this._name
                  + ' with strategy ' + StateUpdateStrategy[strategy]);

        let data = <ManagedNodeStateMapRegisterData>s;

        if (strategy == StateUpdateStrategy.OVERWRITE) {

            // remove everything
            await Promise.all(this._object_iter().map(ob => {
                log.debug(`Removing object [${ob.constructor.name}] ${
                    ob._oid} from ${this._name} (OVWRT)`);
                return this._wrap_remove(ob._name, ob);
            }));

            // add everything
            for (let key of Object.keys(data.objects)) {
                log.debug(`Insert new object [${key}] in ${this._name}`);
                this._objects[key]
                    = await this._wrap_insert(key, data.objects[key]);
            }
        }
        else {
            if (strategy == StateUpdateStrategy.SYNC
                || strategy == StateUpdateStrategy.PICK) {
                // remove objects from register that are not present in the
                // update
                for (let key of Object.keys(this._objects)) {
                    if (data.objects[key] == undefined) {
                        log.debug(`Removing object [${
                            this._objects[key].constructor.name}] ${
                            this._objects[key]._name} from ${
                            this._name} because it is not in the incoming list`);
                        await this._wrap_remove(key, this._objects[key]);
                    }
                }
            }

            log.debug('Merging data in map register ' + this._name);

            // objects to update go here
            let updates:
                [ ManagedNodeStateObjectData, ManagedNodeStateObject<any>][] =
                    [];

            // update objects that with same name and different uids
            for (let key of Object.keys(data.objects)) {
                if (this._objects[key]
                    && (this._objects[key]._uid != data.objects[key].uid)) {

                    log.debug(`Updating object [${
                        this._objects[key].constructor.name}] ${key} in ${
                        this._name}`);

                    updates.push([ data.objects[key], this._objects[key] ]);
                }
            }

            // update all objects asynchronously
            await Promise.all(updates.map(up => this._wrap_set(up[0], up[1])));

            let newobjects: [ string, ManagedNodeStateObjectData ][] = [];

            if (strategy != StateUpdateStrategy.PICK) {
                // find all incoming objects that are not present in the
                // register
                for (let key of Object.keys(data.objects)) {
                    if (this._objects[key] == null) {
                        log.info(`Adding new object ${key} to ${this._name}`);
                        newobjects.push([ key, data.objects[key] ]);
                    }
                }

                // insert new objects asynchronously
                await Promise.all(
                    newobjects.map(async ob => this._objects[ob[0]]
                                   = await this._wrap_insert(ob[0], ob[1])));
            }
        }
    }

    add(name: string, obj: ManagedNodeStateObject<any>)
    {
        obj.init(this);
        obj._name           = name;
        this._objects[name] = obj;
    }
}

export abstract class ManagedNodeStateListRegister extends
    ManagedNodeStateRegister {
    _objects: ManagedNodeStateObject<any>[] = [];

    constructor()
    {
        super();
        this._is_map = false;
    }

    abstract async remove(obj: ManagedNodeStateObject<any>): Promise<void>;
    abstract async insert(obj: ManagedNodeStateObjectData):
        Promise<ManagedNodeStateObject<any>>;

    private async _wrap_insert(obj: ManagedNodeStateObjectData)
    {
        let nobj  = await this.insert(obj);
        nobj._uid = obj.uid;
        nobj._oid = obj.object_id;
        log.debug(`Inserting new object [${nobj.constructor.name}] ${
            nobj._oid} to ${this._name}`);
        return nobj;
    }

    async insertExt(data: ManagedNodeStateObjectData)
    {
        this._objects.push(await this._wrap_insert(data));
    }

    async _update_list(s: ManagedNodeStateRegisterData,
                       strategy: StateUpdateStrategy)
    {
        if (s.map)
            throw 'Did not expect map data in register ' + this._name;

        log.debug('Updating list data in register ' + this._name
                  + ' with strategy ' + StateUpdateStrategy[strategy]);

        let data = <ManagedNodeStateListRegisterData>s;

        if (strategy == StateUpdateStrategy.OVERWRITE) {
            await Promise.all(this._objects.map(ob => {
                log.debug(`Removing object [${ob.constructor.name}] ${
                    ob._oid} from ${this._name}`);
                this.remove(ob);
            }));

            this._objects = await Promise.all(
                data.objects.map(d => this._wrap_insert(d)));
        }
        else {
            if (strategy == StateUpdateStrategy.SYNC
                || strategy == StateUpdateStrategy.PICK) {

                // remove objects from register that are not present in the
                // update
                this._objects = this._objects.filter(obj => {
                    if (data.objects.findIndex(nob => nob.object_id == obj._oid)
                        == -1) {
                        log.debug(`Removing object [${obj.constructor.name}] ${
                            obj._oid} from ${this._name}`)
                        return false;
                    }
                    else
                        return true;
                });
            }

            log.debug('Merging data in list register ' + this._name);

            // objects tp update go here
            let updates:
                [ ManagedNodeStateObjectData, ManagedNodeStateObject<any>][] =
                    [];

            for (let obj of data.objects) {

                // find incoming objects in register
                let tidx = this._objects.findIndex(lobj => lobj._oid
                                                           == obj.object_id);

                // we found our object
                if (tidx != -1 && obj.uid != this._objects[tidx]._uid) {

                    log.debug(`update object ${obj.object_id} ${
                        this._objects[tidx].constructor.name}`);

                    // add to objects to update
                    updates.push([ obj, this._objects[tidx] ]);
                }
            }

            // update all objects asynchronously
            await Promise.all(updates.map(up => this._wrap_set(up[0], up[1])));

            if (strategy != StateUpdateStrategy.PICK) {
                // find all incoming objects that are not present in the
                // register
                let new_objects = data.objects.filter(
                    ob => this._objects.findIndex(pob => pob._oid
                                                         == ob.object_id)
                          == -1);

                // insert new objects asynchronously
                return Promise.all(
                    new_objects.map(async obj => { this._objects.push(
                                        await this._wrap_insert(obj)) }));
            }
        }
    }

    add(obj: ManagedNodeStateObject<any>)
    {
        log.debug(`Insert new object [${obj.constructor.name}] into list`);
        obj.init(this);
        this._objects.push(obj);
    }
}

export abstract class NodeModule {

    _parent: Node;
    _name: string;
    _uid: string;
    _data: any;
    _registers: Record<string, ManagedNodeStateRegister> = {};
    _dirty: boolean;
    events: EventEmitter;

    abstract init(): void;
    abstract start(remote: Connection): void;
    abstract destroy(): void;

    constructor(target: string)
    {
        this._name = target;
        this._uid  = uniqueId();
    }

    _init(parent: Node)
    {
        this._parent = parent;
        this.events = this._parent.events;
        this.init();
    }

    _start(remote: Connection)
    {
        this.start(remote);
    }

    modify()
    {
        this._dirty = true;
        this._uid   = uniqueId();
    }

    async _export()
    {
        let regkeys                             = Object.keys(this._registers);
        let out: ManagedNodeStateRegisterData[] = [];

        for (let reg of regkeys)
            out.push(await this._registers[reg]._export());

        return <ManagedNodeStateModuleData>{
            uid : this._uid,
            name : this._name,
            raw : this._data,
            registers : out
        };
    }

    async _save_child(reg: ManagedNodeStateRegister,
                      obj?: ManagedNodeStateObject<any>)
    {
        return this._parent._save_child(this, reg, obj);
    }

    async save()
    {
        return this._parent._save_child(this);
    }

    _clear()
    {
        this._dirty = false;
    }

    _map(): ModuleReference
    {
        let regs     = [];
        let reg_keys = Object.keys(this._registers);

        for (let reg of reg_keys)
            regs.push(this._registers[reg]._map());

        return { uid : this._uid, name : this._name, registers : regs };
    }

    add(reg: ManagedNodeStateRegister, name: string)
    {
        reg.init(name, this);
        this._registers[reg._name] = reg;
    }

    async _restore(state: ManagedNodeStateModuleData,
                   strategy: StateUpdateStrategy = StateUpdateStrategy.SYNC)
    {
        log.debug('Restoring data for module ' + this._name);
        return Promise.all(state.registers.map(
            reg => this._registers[reg.name]._restore(reg, strategy)));
    }

    async applyModuleData(mod: ManagedNodeStateModuleData)
    {
        return this._restore(mod, StateUpdateStrategy.SYNC);
    }

    async applyRegisterData(name: string, reg: ManagedNodeStateRegisterData)
    {
        let lreg = this._registers[name];
        if (lreg)
            lreg._restore(reg, StateUpdateStrategy.SYNC);
    }

    async applyObjectData(regname: string, obj: ManagedNodeStateObjectData)
    {
        let lreg = this._registers[regname];
    }
}

interface UpdateObjectMessage {
    module: string;
    register: string;
    data: ManagedNodeStateObjectData;
}

interface UpdateRegisterMessage {
    module: string;
    data: ManagedNodeStateRegisterData;
}

interface UpdateModuleMessage {
    data: ManagedNodeStateModuleData;
}

interface GetNodeStateMessage {
    modules: { name: string, data: ModuleReference }[];
}

interface ReturnNodeStateMessage {
    modules: { name: string, module: ManagedNodeStateModuleData }[];
    registers: { mod: string, register: ManagedNodeStateRegisterData }[];
    objects: {
        mod: string,
        register_name: string,
        object: ManagedNodeStateObjectData,
        add?: boolean,
        name?: string
    }[];
}

export class NodeDataStorage extends NodeMessageInterceptor {

    _modules: Record<string, ManagedNodeStateModuleData> = {};
    _local_file: string;
    _save_timeout: NodeJS.Timeout;
    _saving: boolean     = false;
    _save_again: boolean = false

    constructor(config: any)
    {
        super();
        this._local_file = configFileDir('nodestate/')
                           + safe_filename(config.node_name || 'default_node')
                           + '.json';
        if (!fs.existsSync(configFileDir('nodestate')))
            fs.mkdirSync(configFileDir('nodestate'));
        if (!fs.existsSync(this._local_file)) {
            fs.writeFileSync(this._local_file, JSON.stringify({ modules : {} }))
        }
        else {
            this.restoreStateFromFile().then((data) => {
                this._modules = data.modules;
                log.info('Restored state from file');
                this.saveLater();
            });
        }
    }

    async restoreStateFromFile(): Promise<any>
    {
        return new Promise((resolve, reject) => {
            fs.readFile(this._local_file, (err, data) => {
                if (err)
                    reject(err);
                resolve(JSON.parse(data.toString()));
            });
        });
    }

    async writeState()
    {
        return new Promise((resolve, reject) => {
            fs.writeFile(this._local_file,
                         JSON.stringify({ modules : this._modules }, null, 2),
                         err => {
                             if (err)
                                 log.error(err);

                             resolve();
                         });
        });
    }

    saveLater()
    {
        if (this._save_timeout)
            clearTimeout(this._save_timeout);

        if (this._saving)
            return this._save_again = true;

        this._save_timeout = setTimeout(() => {
            log.info('Saving current state to disk');
            this.writeState()
                .then(() => {
                    if (this._save_again) {
                        this._save_again = false;
                        this.saveLater();
                    }
                    this._saving = false
                })
                .catch(err => {
                    log.error('Could not save file ' + err);
                });
                this._saving = true;
        }, 5000);
    }

    target(): string
    {
        return 'state-manager';
    }

    async handleMessage(msg: Message, from_ipc: boolean)
    {
        console.log(msg);
        switch (msg.field) {
            case 'update-object':
                return this.updateObject(<UpdateObjectMessage>msg.data);
            case 'update-register':
                return this.updateRegister(<UpdateRegisterMessage>msg.data);
            case 'update-module':
                return this.updateModule(<UpdateModuleMessage>msg.data);
            case 'get': return this.get(<GetNodeStateMessage>msg.data);
        }
    }

    updateObject(msg: UpdateObjectMessage)
    {
        if (this._modules[msg.module]) {
            let mod = this._modules[msg.module];
            let regidx
                = mod.registers.findIndex(reg => reg.name == msg.register);
            if (regidx != -1) {
                let reg = mod.registers[regidx];
                if (reg.map) {
                    (<ManagedNodeStateMapRegisterData>reg)
                        .objects[(<any>msg.data).name]
                        = msg.data.data;
                }
                else {
                    let listreg   = <ManagedNodeStateListRegisterData>reg;
                    let objectidx = listreg.objects.findIndex(
                        obj => obj.object_id == msg.data.object_id);

                    if (objectidx != -1)
                        ignore(listreg.objects.push(msg.data));
                    else
                        ignore(listreg.objects[objectidx] = msg.data);
                }
                return this.saveLater();
            }
            else
                throw 'Register not found';
        }
        else
            throw 'Module not found';
    }

    updateRegister(msg: UpdateRegisterMessage)
    {
        if (this._modules[msg.module]) {
            let mod = this._modules[msg.module];
            let regidx
                = mod.registers.findIndex(reg => reg.name == msg.data.name);

            if (regidx != -1)
                mod.registers[regidx] = msg.data;
            else
                mod.registers.push(msg.data);

            this.saveLater();
        }
        else
            throw 'Module not found';
    }

    updateModule(msg: UpdateModuleMessage)
    {
        this._modules[msg.data.name] = msg.data;
        this.saveLater();
    }

    get(msg: GetNodeStateMessage)
    {
        log.info('Comparing internal node data to incoming refs')
        let output: ReturnNodeStateMessage
            = { modules : [], registers : [], objects : [] };

        msg.modules.forEach(
            mod => this._check_module(output, mod.name, mod.data));

        console.log(output);

        return output;
    }

    _check_module(out: ReturnNodeStateMessage, name: string,
                  modref: ModuleReference)
    {
        log.debug('Check module ' + name);
        let module = this._modules[name];

        if (module) {
            log.debug('Module found.');
            if (module.uid != modref.uid) {
                log.debug('Module uid has changed. Update full module');
                out.modules.push({ name, module });
            }
            else {
                if (modref.registers) {
                    log.debug('Check registers');
                    modref.registers.forEach(regref => {
                        let reg = module.registers.findIndex(
                            reg => reg.name == regref.name);
                        if (reg != -1) {
                            log.debug('Check register ' + regref.name);
                            this._check_register(out, module.name,
                                                 module.registers[reg], regref);
                        }
                        else
                            log.warn(`Register ${regref.name} not found`);
                    });
                }
            }
        }
    }

    _check_register(out: ReturnNodeStateMessage, mod: string,
                    register: ManagedNodeStateRegisterData,
                    ref: RegisterReference)
    {
        if (register.uid != ref.uid) {
            log.debug(`Register uid has changed. Update full register`);
            out.registers.push({ mod, register })
        }
        else {
            if (register.map != ref.map)
                throw `Register type mismatch for register ${
                    register.name} in module ${mod}`;

            if (register.map) {
                let map_register = <ManagedNodeStateMapRegisterData>register;
                let keys         = Object.keys(map_register.objects);
                for (let key of keys)
                    this._check_object(
                        out, mod, register.name, map_register.objects[key],
                        ref.objects[ref.objects.findIndex(r => r.name == key)]);
            }
            else {
                let list_register = <ManagedNodeStateListRegisterData>register;
                list_register.objects.forEach(obj => {
                    this._check_object(out, mod, register.name, obj,
                                       ref.objects[ref.objects.findIndex(
                                           o => o.oid == obj.object_id)]);
                });
            }
        }
    }

    _check_object(out: ReturnNodeStateMessage, mod: string,
                  register_name: string, local_obj: ManagedNodeStateObjectData,
                  ref: ObjectReference)
    {
        log.debug(`Check object ${local_obj.object_id}`);
        if (ref) {
            if (ref.uid != local_obj.uid) {
                log.debug(`Update object [${local_obj.object_id}]`);
                out.objects.push(
                    { mod, register_name, object : local_obj, add : false });
            }
        }
        else {
            log.debug(`Add new object [${local_obj.object_id}]`);
            out.objects.push(
                { mod, register_name, object : local_obj, add : true });
        }
    }
}

export abstract class Node {

    _id: NodeIdentification;
    _remote: Connection;
    _modules: Record<string, NodeModule> = {};
    _state_manager: Requester;
    events: EventEmitter;

    constructor(id: NodeIdentification)
    {
        this._id = id;
    }

    abstract init(): void;
    abstract start(): void;
    abstract destroy(): void;

    _destroy()
    {
        this.destroy();

        if(this.events)
            this.events.removeAllListeners();

        let keys = Object.keys(this._modules);
        for(let key of keys)
            this._modules[key].destroy();
    }

    _init(remote: Connection, node_events: EventEmitter)
    {
        this.events         = node_events;
        this._remote        = remote;
        this._state_manager = this._remote.getRequester('state-manager');

        this.init();

        let modnames = Object.keys(this._modules);
        for (let mod of modnames) {
            this._modules[mod]._init(this);
        }

        this._reload_data_from_node().then(() => {
            for (let mod of modnames) {
                this._modules[mod]._start(remote);
            }
            this._start();
        });
    }

    _start()
    {
        this.start();
    }

    async _save_child(mod: NodeModule, reg?: ManagedNodeStateRegister,
                      obj?: ManagedNodeStateObject<any>)
    {
        if (reg) {
            if (obj)
                return this._state_manager.set(
                    'update-object', <UpdateObjectMessage>{
                        module : mod._name,
                        register : reg._name,
                        data : await obj.get()
                    });
            else
                return this._state_manager.set(
                    'update-register', <UpdateRegisterMessage>{
                        module : mod._name,
                        data : await reg._export()
                    });
        }
        else {
            return this._state_manager.set(
                'update-module',
                <UpdateModuleMessage>{ data : await mod._export() })
        }
    }

    async _reload_data_from_node()
    {
        let mods                     = Object.keys(this._modules);
        let msg: GetNodeStateMessage = { modules : [] };

        for (let mod of mods)
            msg.modules.push({ name : mod, data : this._modules[mod]._map() });

        let res = <ReturnNodeStateMessage>(
                      await this._state_manager.request('get', msg))
                      .data;

        await Promise.all(res.modules.map(mod => {
            let local_m = this._modules[mod.name];
            if (local_m)
                return local_m._restore(mod.module, StateUpdateStrategy.SYNC);
        }));

        await Promise.all(res.registers.map(reg => {
            let local_m = this._modules[reg.mod];
            if (local_m) {
                let local_reg = local_m._registers[reg.register.name];
                if (local_reg)
                    return local_reg._restore(reg.register, StateUpdateStrategy.SYNC);
            }
        }));

        res.objects.forEach(async obj => {
            let local_m = this._modules[obj.mod];
            if (local_m) {
                let local_reg = local_m._registers[obj.register_name];
                if (local_reg) {
                    try {
                        if (local_reg._is_map) {
                            if (typeof obj.name == 'undefined')
                                return ignore(log.error(
                                    'missing name property on incoming object'));

                            let mapreg = <ManagedNodeStateMapRegister>local_reg;

                            if (obj.add) {
                                await mapreg.insertExt(obj.name, obj.object);
                            }
                            else {
                                let local_obj = mapreg._objects[obj.name];
                                if (local_obj)
                                    await local_obj.set(obj.object);
                                else
                                    await mapreg.insertExt(obj.name, obj.object);
                            }
                        }
                        else {
                            let listreg
                                = <ManagedNodeStateListRegister>local_reg;

                            if (obj.add) {
                                listreg.insertExt(obj.object);
                            }
                            else {
                                let obj_idx = listreg._objects.findIndex(
                                    o => o._oid == obj.object.object_id);
                                if (obj_idx != -1)
                                    await listreg._objects[obj_idx].set(
                                        obj.object)
                                    else await listreg.insertExt(obj.object);
                            }
                        }
                    }
                    catch (err) {
                        log.error(`Failed to restore object [${obj.mod}] [${
                            obj.register_name}] [${obj.object.object_id}] ${
                            obj.name}`);
                    }
                }
            }
        });

        this._start();
    }

    name()
    {
        return this._id.name;
    }

    id()
    {
        return this._id.id;
    }

    type()
    {
        return this._id.type;
    }

    remote()
    {
        if (this.remote)
            return this._remote;
        else
            throw 'Cannot access remote before initialization';
    }

    add(module: NodeModule)
    {
        this._modules[module._name] = module;
    }

    getModule<ModuleType>(name: string)
    {
        return <ModuleType><unknown>this._modules[name];
    }
}

export type WEBIFNodeEventHandler = (socket: SocketIO.Socket, node: Node, data: any, transaction?: TransactionID) => void;
export type WEBIFEventHandler = (socket: SocketIO.Socket, data: any) => void;
export type TransactionID = string;

export abstract class ServerModule {
    
    _name: string;
    events: EventEmitter;
    server: Server;
    webif: WebInterface;

    _init(srv: Server, webif: WebInterface)
    {
        this.webif = webif;
        this.server = srv;
        this.init();
    }

    abstract init(): void;

    constructor(name: string)
    {
        this.events = new EventEmitter();
        this._name = name;
    }

    getNode(id: string)
    {

    }

    handle(event: string, handler: WEBIFNodeEventHandler)
    {
        this.webif.attachHandler(this, this._name, event, (socket: SocketIO.Socket, nodeid: string, data: any) => {
            let node = this.server._nodes[nodeid];
            if(!node) {
                log.error(`Node not found for message -${this._name}.${event} - node: ${nodeid}`);
                socket.emit('error', `Node not found for id ${nodeid}`);
                return;
            }
            log.debug(`Dispatch event: -${this._name}.${event} - ${nodeid}`);
            handler(socket, node, data);
        }); 
    }

    handleGlobal(event: string, handler: WEBIFEventHandler)
    {
        this.webif.attachHandler(this, this._name, event, (socket: SocketIO.Socket, data: any) => {
            handler(socket, data);
        }); 
    }
}

export class ServerInternalsModule extends ServerModule {
    init() {
        this.handleGlobal('nodes', (socket, data) => {
            let ids = Object.keys(this.server._nodes);
            let out: NodeIdentification[] = [];
            for(let id of ids)
                out.push(this.server._nodes[id]._id);

            log.info(`Sending node information`);

            socket.emit('server.nodes', out);
        });
    }

    constructor()
    {
        super('server');
    }
}

export abstract class Server {

    _srv: SIServerWSServer
    _nodes: Record<string, Node> = {};
    _modules: Record<string, ServerModule> = {};
    _webif: WebInterface;
    _event_bus: EventEmitter;

    constructor(wssrv: SIServerWSServer, webif: WebInterface)
    {
        this._event_bus = new EventEmitter();
        this._srv       = wssrv;
        this._webif = webif;
        this._srv.on('add-session', this._on_add_remote.bind(this));
        this._srv.on('remove-session', this._on_remove_remote.bind(this));
        this.add(new ServerInternalsModule());
    }

    add(module: ServerModule)
    {
        this._modules[module._name] = module;
        module._init(this, this._webif);
    }

    _on_add_remote(session: SIServerWSSession)
    {
        log.info(`Create new node instance for [${
            NODE_TYPE[session.id().type]}] ${session.id().name}`);
        let node               = this.createNode(session.id());
        this._nodes[node.id()] = node;
        node._init(session, this._event_bus);
    }

    _on_remove_remote(session: SIServerWSSession)
    {
        let node = this._nodes[session.id().id];
        if (node) {
            log.info(`Destroy node instance for [${
                NODE_TYPE[session.id().type]}] ${session.id().name}`);
            node._destroy();
            this.destroyNode(node);
            delete this._nodes[session.id().id];
        }
    }

    abstract createNode(id: NodeIdentification): Node;
    abstract destroyNode(node: Node): void;
}