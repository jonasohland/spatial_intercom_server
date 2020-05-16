import * as fs from 'fs';
import * as os from 'os';

function showfileDir(subdir?: string) {
    return os.homedir() + "/Spatial\ Intercom" + ((subdir)? "/" + subdir : "");
}

export class Showfile {
    constructor() {

    }
}

export class ShowfileManager {
    constructor() {
        if(!fs.existsSync(showfileDir()))
            fs.mkdirSync(showfileDir());

        if(!fs.existsSync(showfileDir("showfiles")))
            fs.mkdirSync(showfileDir('showfiles'))
    }

    createEmptyShow(name: string)
    {
        fs.mkdirSync(showfileDir("showfiles/" + name));
        fs.writeFileSync(showfileDir(`showfiles/${name}/show.json`), "{}");
    }

    listShows(): Promise<string[]> 
    {
        return new Promise((res, rej) => {

        })
    }
}