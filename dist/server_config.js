"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const ini_1 = __importDefault(require("ini"));
const net = __importStar(require("net"));
const os = __importStar(require("os"));
const Logger = __importStar(require("./log"));
const log = Logger.get('CFG');
const _config_path = os.userInfo().homedir + '/.spatial_intercom';
let _config_file = {};
function loadServerConfigFile() {
    if (fs.existsSync(_config_path)) {
        log.info('Loading configuration file from ' + _config_path);
        _config_file = ini_1.default.parse(fs.readFileSync(_config_path).toString());
    }
}
exports.loadServerConfigFile = loadServerConfigFile;
function getNodeName(options) {
    let conf_file_name;
    if (_config_file.instance)
        conf_file_name = _config_file.instance.name;
    return options.nodeName || conf_file_name || os.hostname();
}
function getInterface(option, interfaces) {
    if (interfaces[option])
        return interfaces[option]
            .filter((intf) => intf.family == 'IPv4')[0]
            .address;
    else
        log.error('Could not find network interface ' + option);
}
function parseWebserverOptions() { }
function merge(cmd_opts) {
    let output = {};
    if (!_config_file.network)
        _config_file.network = {};
    let interface_ = cmd_opts.interface || _config_file.network.interface;
    let webif_opt = cmd_opts.webInterface || _config_file.network.web_interface
        || cmd_opts.interface || _config_file.network.interface;
    const netifs = os.networkInterfaces();
    if (interface_)
        output.interface = (net.isIP(interface_))
            ? interface_
            : getInterface(interface_, netifs);
    if (webif_opt)
        output.web_interface = (net.isIP(webif_opt))
            ? webif_opt
            : getInterface(webif_opt, netifs);
    output.node_name = getNodeName(cmd_opts);
    output.webserver = cmd_opts.webserver;
    output.server_port = Number.parseInt(cmd_opts.port) ||
        Number.parseInt(_config_file.network.port) || 45545;
    output.webserver_port = Number.parseInt(cmd_opts.webserverPort) ||
        Number.parseInt(_config_file.network.webserver_port) || 80;
    // console.log(_config_file.network);
    // console.log(output);
    return output;
}
exports.merge = merge;
//# sourceMappingURL=server_config.js.map