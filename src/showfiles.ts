import {DepGraph} from 'dependency-graph';
import {EventEmitter} from 'events';
import * as fs from 'fs';
import * as os from 'os';
import {v4 as uuid} from 'uuid';

import {showfileDir} from './files'
import * as logger from './log';

const log = logger.get('SHOWFL');

interface ShowfileRecordData {
    data: any;
    name: string;
    uid: string;
}

interface ShowfileSectionData {
    records: ShowfileRecordData[];
    name: string;
    uid: string;
}

interface ShowfileTargetData {
    name: string;
    sections: ShowfileSectionData[];
}

interface ShowfileData {
    sections: ShowfileSectionData[];
    created: string;
}

export abstract class ShowfileTarget extends EventEmitter {

    _sections: ShowfileSection[] = [];

    abstract targetName(): string;
    abstract onEmptyShowfileCreate(s: Showfile): void;

    beforeShowfileLoad()
    {
    }
    afterShowfileLoad()
    {
    }

    addSection(section: ShowfileSection)
    {
        if (this._sections.findIndex(sc => sc.showfileSectionName()
                                           == section.showfileSectionName())
            != -1)
            return log.error('Will not add section '
                             + section.showfileSectionName()
                             + '. Section already in target');

        log.debug(`Registered new section '${
            section.showfileSectionName()}' in module '${this.targetName()}'`);

        this._sections.push(section);
    }

    doLoadShowfile(sf: Showfile)
    {
        this._sections.forEach(s => {
            let data = sf.getSectionDataByName(s.showfileSectionName());
            if (data)
                s.restoreSection(data);
            else
                log.warn('No data for section ' + s.showfileSectionName());
        });
    }

    async showfileTargetData(): Promise<ShowfileTargetData>
    {
        return {
            sections : await Promise.all(
                this._sections.map(s => s.showfileSectionData())),
            name : this.targetName()
        };
    }
}

export abstract class ShowfileRecord {

    _name: string;
    _uid: string;

    constructor(name: string)
    {
        this._name = name;
        this._uid  = uuid();
    }

    abstract plain(): Promise<any>;
    abstract restore(data: any): void;

    async doSave()
    {
        log.debug('Saving record \'' + this._name + '\'');
        return {
            data : await this.plain(),
            uid : this._uid,
            name : this._name
        };
    }
}

export abstract class ShowfileSection {

    private _name: string;
    private _uid: string;
    private _records: ShowfileRecord[] = [];

    constructor(name?: string)
    {
        if (name) {
            this._uid     = uuid();
            this._name    = name;
            this._records = [];
        }
    }

    abstract restoreSection(data: any): ShowfileRecord[]

    addRecord(s: ShowfileRecord)
    {
        log.debug('Add new record \'' + s._name + '\' to section \''
                  + this.showfileSectionName() + '\'');
        this._records.push(s);
    }

    showfileSectionName()
    {
        return this._name;
    }

    showfileSectionId()
    {
        return this._uid;
    }

    async showfileSectionData(): Promise<ShowfileSectionData>
    {
        log.debug('Retrieving data from showfile section \'' + this._name
                  + '\'');
        return {
            records : await Promise.all(this._records.map(r => r.doSave())),
            name : this._name,
            uid : this._uid
        };
    }
}

export class Showfile {

    _sections: ShowfileSectionData[] = [];
    _created: string;

    constructor()
    {
    }

    init()
    {
        this._created = (new Date(Date.now())).toISOString();
    }

    getSectionDataByName(name: string): ShowfileSectionData
    {
        return this._sections.find(sect => name == sect.name);
    }

    getSectionById(id: string): ShowfileSectionData
    {
        return this._sections.find(sect => id == sect.uid);
    }
}

export class ShowfileManager {

    targets: ShowfileTarget[] = [];
    dependencies: [ string, string ][];

    constructor()
    {
        if (!fs.existsSync(showfileDir()))
            fs.mkdirSync(showfileDir());

        if (!fs.existsSync(showfileDir('showfiles')))
            fs.mkdirSync(showfileDir('showfiles'))
    }

    register(t: ShowfileTarget, dependencies?: string[])
    {
        let name = t.targetName();

        if (dependencies)
            this.dependencies.push(
                ...dependencies.map(dep => <[ string, string ]>[ name, dep ]));

        this.targets.push(t);

        log.debug('Registered new module \'' + name + '\'');
    }

    createEmptyShow(name: string)
    {
        fs.mkdirSync(showfileDir('showfiles/' + name));
        fs.writeFileSync(showfileDir(`showfiles/${name}/show.json`), '{}');
    }

    async storeShowfile()
    {
        try {
            let data = await Promise.all(
                this.targets.map(tgt => tgt.showfileTargetData()));
        }
        catch (err) {
            log.error('Could not save showfile: ' + err);
        }
    }

    loadShowfile()
    {
        let s = new Showfile();

        let graph = new DepGraph();

        this.targets.forEach(t => graph.addNode(t.targetName(), t));
        this.dependencies.forEach(d => graph.addDependency(d[0], d[1]));

        let load_seq = graph.overallOrder();

        load_seq.forEach(tgt => {
            this.targets.find(t => t.targetName() == tgt).beforeShowfileLoad();
        });

        load_seq.forEach(tgt => {
            this.targets.find(t => t.targetName() == tgt).doLoadShowfile(s);
        });

        load_seq.forEach(tgt => {
            this.targets.find(t => t.targetName() == tgt).afterShowfileLoad();
        });
    }

    start()
    {
    }
}