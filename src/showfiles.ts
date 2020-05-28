import {DepGraph} from 'dependency-graph';
import {EventEmitter} from 'events';
import * as fs from 'fs';
import * as os from 'os';

import * as logger from './log';

const log = logger.get("SHFILE");

function showfileDir(subdir?: string)
{
    return os.homedir() + '/Spatial\ Intercom' + ((subdir) ? '/' + subdir : '');
}


export abstract class ShowfileTarget extends EventEmitter {

    abstract targetName(): string;

    beforeShowfileLoad() {}
    abstract onShowfileLoad(s: Showfile): void;
    abstract onEmptyShowfileCreate(s: Showfile): void;
    afterShowfileLoad() {}
}

export class Showfile {

    constructor() {}

    getSection(name: string) {}
}

export class ShowfileManager {

    targets: ShowfileTarget[] = [];
    dependencies: [ string, string ][];

    constructor()
    {
        if (!fs.existsSync(showfileDir())) fs.mkdirSync(showfileDir());

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

        log.info("Registered new module '" + name + "'");
    }

    createEmptyShow(name: string)
    {
        fs.mkdirSync(showfileDir('showfiles/' + name));
        fs.writeFileSync(showfileDir(`showfiles/${name}/show.json`), '{}');
    }

    loadShowfile() {
        
        let s = new Showfile();

        let graph = new DepGraph();

        this.targets.forEach(t => graph.addNode(t.targetName(), t));
        this.dependencies.forEach(d => graph.addDependency(d[0], d[1]));

        let load_seq = graph.overallOrder();

        load_seq.forEach(tgt => {
            this.targets.find(t => t.targetName() == tgt).beforeShowfileLoad();
        })

        load_seq.forEach(tgt => {
            this.targets.find(t => t.targetName() == tgt).onShowfileLoad(s);
        })

        load_seq.forEach(tgt => {
            this.targets.find(t => t.targetName() == tgt).afterShowfileLoad();
        })
    }

    start()
    {
    }
}