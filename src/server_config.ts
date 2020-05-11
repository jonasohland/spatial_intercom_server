import commander from 'commander';
import * as fs from 'fs';
import ini from 'ini';
import * as net from 'net';
import * as os from 'os';

import * as Logger from './log';

const log = Logger.get('CFG');

const _config_path = os.userInfo().homedir + '/.spatial_intercom';
let _config_file: any = {};

export function loadServerConfigFile() {

    if (fs.existsSync(_config_path)) {
        log.info('Loading configuration file from ' + _config_path);
        _config_file = ini.parse(fs.readFileSync(_config_path).toString());
    }
}

function getNodeName(options: any)
{
    let conf_file_name;

    if (_config_file.instance) conf_file_name = _config_file.instance.name;

    return options.nodeName || conf_file_name || os.hostname();
}

function getInterface(option: string, interfaces: any)
{
    if (interfaces[option])
        return interfaces[option]
            .filter((intf: any) => intf.family == 'IPv4')[0]
            .address;
    else
        log.error('Could not find network interface ' + option);
}

function parseWebserverOptions() {}

export function merge(cmd_opts: commander.Command)
{
    let output: {   
        interface?: string, 
        web_interface?: string, 
        node_name?: string, 
        webserver?: boolean, 
        server_port?: number,
        webserver_port?: number 
    } = {};

    if (!_config_file.network) _config_file.network = {};

    let interface_: string
        = cmd_opts.interface || _config_file.network.interface;

    let webif_opt: string
        = cmd_opts.webInterface || _config_file.network.web_interface
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
                            Number.parseInt(_config_file.network.port) || 45545

    output.webserver_port = Number.parseInt(cmd_opts.webserverPort) || 
                            Number.parseInt(_config_file.network.webserver_port) || 80

    // console.log(_config_file.network);
    // console.log(output);

    return output;
}
