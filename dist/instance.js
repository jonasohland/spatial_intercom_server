"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const AudioDevices = __importStar(require("./audio_devices"));
const DSP = __importStar(require("./dsp"));
const VST = __importStar(require("./vst"));
const IPC = __importStar(require("./ipc"));
const Logger = __importStar(require("./log"));
const log = Logger.get('MGT');
const netlog = Logger.get('NET');
class InstanceID {
}
exports.InstanceID = InstanceID;
class SpatialIntercomInstance {
    constructor(nodename, nid, local, addrs, dsp) {
        this.name = nodename;
        this.id = nid;
        this.addresses = addrs;
        if (local)
            this.dsp = new IPC.LocalConnection('default');
        else {
            this.dsp = new IPC.RemoteConnection(dsp);
        }
        this.graph = new DSP.Graph(this.dsp);
        this.devices = new AudioDevices.Manager(this.dsp);
        this.vst = new VST.Manager(this.dsp);
        this.dsp.begin();
        this.dsp.on('connection', () => {
            this.graph.sync();
            this.vst.refreshPluginList();
            this.graph.setInputNode(64);
            this.graph.setOutputNode(64);
        });
    }
}
exports.SpatialIntercomInstance = SpatialIntercomInstance;
//# sourceMappingURL=instance.js.map