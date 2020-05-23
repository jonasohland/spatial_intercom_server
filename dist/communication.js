"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const SocketIO = __importStar(require("socket.io"));
const SocketIOClient = __importStar(require("socket.io-client"));
const events_1 = require("events");
const Logger = __importStar(require("./log"));
const log = Logger.get('COM');
var SIClientState;
(function (SIClientState) {
    SIClientState[SIClientState["DISCONNECTED"] = 0] = "DISCONNECTED";
    SIClientState[SIClientState["IDENT_EXCHANGE"] = 1] = "IDENT_EXCHANGE";
    SIClientState[SIClientState["WAITING"] = 2] = "WAITING";
    SIClientState[SIClientState["CONNECTED"] = 3] = "CONNECTED";
    SIClientState[SIClientState["RECONNECTING"] = 4] = "RECONNECTING";
})(SIClientState || (SIClientState = {}));
;
class SINodeWSConnection {
}
class SIServerWSAdapter extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.wsserver = SocketIO.listen(config.server_port);
    }
}
class SINodeWSAdapter extends events_1.EventEmitter {
    constructor() {
        super();
        this.wsclient = SocketIOClient.connect("");
    }
}
//# sourceMappingURL=communication.js.map