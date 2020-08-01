import commander from 'commander';
import * as fs from 'fs';
import ini from 'ini';
import * as net from 'net';
import * as os from 'os';

import * as Logger from './log';

const log = Logger.get('CONFIG');

const _config_path = os.userInfo().homedir + '/.spatial_intercom';
let _config_file: any = {};

export function loadServerConfigFile(config_file?: string) {

    let configfile = config_file || _config_path

    if (fs.existsSync(configfile)) {
        log.info('Loading configuration file from ' + _config_path);
        _config_file = ini.parse(fs.readFileSync(_config_path).toString());
    } else 
    {
        log.warn("No config file found at " + configfile);
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


export function merge(cmd_opts: commander.Command)
{
    let output: {   
        interface?: string, 
        web_interface?: string, 
        node_name?: string, 
        webserver?: boolean, 
        server_port?: number,
        webserver_port?: number,
        rrcs?: string,
        rrcs_osc_host?: string,
        rrcs_osc_port?: number 
    } = {};

    if (!_config_file.network) _config_file.network = {};
    if (!_config_file.artist) _config_file.artist = {};

    let interface_: string
        = cmd_opts.interface || _config_file.network.interface;

    let webif_opt: string
        = cmd_opts.webInterface || _config_file.network.web_interface
          || cmd_opts.interface || _config_file.network.interface;

    output.rrcs = cmd_opts.rrcs || _config_file.artist.rrcs;

    output.rrcs_osc_host = cmd_opts.rrcsOscHost || _config_file.artist.rrcs_osc_host || '127.0.0.1';
    output.rrcs_osc_port = cmd_opts.rrcsOscPort || _config_file.artist.rrcs_osc_port || 9955;
    output.rrcs_osc_port = Number.parseInt(<any> output.rrcs_osc_port);

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

    output.server_port = Number.parseInt(cmd_opts.port) || Number.parseInt(process.env.SI_SERVER_PORT) ||
                            Number.parseInt(_config_file.network.port) || 45545

    output.webserver_port = Number.parseInt(cmd_opts.webserverPort) || Number.parseInt(process.env.SI_WEBSERVER_PORT) ||
                            Number.parseInt(_config_file.network.webserver_port) || 8090

    // console.log(_config_file.network);
    // console.log(output);

    return output;
}
