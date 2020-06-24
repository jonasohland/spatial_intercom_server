import { v4 as uniqueId } from 'uuid';

import {SIServerWSSession} from './communication';
import {Requester} from './ipc';

interface ManagedNodeStateObjectData {
    object_id: string,
    uid: string,
    data: any
}

interface ManagedNodeStateRegisterData {
    name: string,
    uid: string,
    raw: any,
    objects: ManagedNodeStateObjectData[]
}

interface ManagedNodeStateData {
    name: string,
    uid: string,
    raw: any,
    registers: ManagedNodeStateRegisterData[]
}

interface NodeStateUIDMap {
    uid: string,
    name: string,
    registers?: {
        uid: string,
        name: string,
        objects?: {
            oid: string,
            uid: string
        }[]
    }[]
}

export abstract class ManagedNodeStateObject<EncapsulatedType extends any> {

    _uid: string;
    _oid: string;
    _dirty: boolean;

    abstract async set(val: EncapsulatedType): Promise<void>;
    abstract async get(): Promise<EncapsulatedType>;

    init()
    {
        this._oid = uniqueId();
        this._uid = uniqueId();
    }

    async _export() {
        return <ManagedNodeStateObjectData> {
            object_id: this._oid,
            uid: this._uid,
            data: await this.get()
        }
    }

    _map()
    {
        return {
            oid: this._oid,
            uid: this._uid
        }
    }
}

export abstract class ManagedNodeStateRegister {

    _name: string;
    _uid: string;
    _dirty: boolean;
    _rawdata: any;
    _objects: ManagedNodeStateObject<any>[] = [];

    init(name: string)
    {
        this._name = name;
        this._uid = uniqueId();
    }

    async _export()
    {
        return <ManagedNodeStateRegisterData> {
            name: this._name,
            uid: this._uid,
            raw: this._rawdata,
            objects: await Promise.all(this._objects.map(obj => obj._export()))
        }
    }

    _map()
    {
        return {
            uid: this._uid,
            name: this._name,
            objects: this._objects.map(o => o._map())
        }
    }

    add(obj: ManagedNodeStateObject<any>)
    {
        obj.init();
        this._objects.push(obj);
    }
}

export class NodeModuleState {    
    
    _name: string;
    _uid: string;
    _data: any;
    _registers: Record<string, ManagedNodeStateRegister> = {};

    _dirty: boolean;

    async _export()
    {
        let regkeys = Object.keys(this._registers);
        let out: ManagedNodeStateRegisterData[] = [];

        for(let reg of regkeys) 
            out.push(await this._registers[reg]._export());

        return <ManagedNodeStateData> {
            uid: this._uid,
            name: this._name,
            raw: this._data,
            registers: out
        };
    }

    _map(): NodeStateUIDMap
    {
        let regs = [];
        let reg_keys = Object.keys(this._registers);

        for(let reg of reg_keys)
            regs.push(this._registers[reg]._map());

        return {
            uid: this._uid,
            name: this._name,
            registers: regs
        }
    }
}

export abstract class NodeModule extends Requester {

    _state_manager: Requester;
    _local_state: NodeModuleState;

    constructor(con: SIServerWSSession, target: string)
    {
        super(con, target);
        this._local_state = new NodeModuleState();
        this._local_state._name = target;
        this._local_state._uid = uniqueId();
        this._state_manager = con.getRequester('state');
    }

    async update()
    {
        if (this._local_state._dirty)
            return this._update_all();
    }

    add(reg: ManagedNodeStateRegister, name: string)
    {
        reg.init(name);
        this._local_state._registers[reg._name] = reg;
    }

    async restore(state: NodeModuleState)
    {
    }

    async _update_all()
    {
    }
}

export class Node {
}