"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
function showfileDir(subdir) {
    return os.homedir() + "/Spatial\ Intercom" + ((subdir) ? "/" + subdir : "");
}
class Showfile {
    constructor() {
    }
}
exports.Showfile = Showfile;
class ShowfileManager {
    constructor() {
        if (!fs.existsSync(showfileDir()))
            fs.mkdirSync(showfileDir());
        if (!fs.existsSync(showfileDir("showfiles")))
            fs.mkdirSync(showfileDir('showfiles'));
    }
    createEmptyShow(name) {
        fs.mkdirSync(showfileDir("showfiles/" + name));
        fs.writeFileSync(showfileDir(`showfiles/${name}/show.json`), "{}");
    }
    listShows() {
        return new Promise((res, rej) => {
        });
    }
}
exports.ShowfileManager = ShowfileManager;
//# sourceMappingURL=showfiles.js.map