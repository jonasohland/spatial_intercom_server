import commander from 'commander';
import * as fs from 'fs';
import ini from 'ini';
import isIp from 'is-ip';
import * as net from 'net';
import * as os from 'os';

import * as Logger from './log';

const log = Logger.get('CFG');

let config_path = os.userInfo().homedir + '/.siserver';

let conf_file: any = {};

if (fs.existsSync(config_path)) {
    log.info('Loading configuration file from ' + config_path);
    conf_file = ini.parse(fs.readFileSync(config_path).toString());
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

function parseWebserverOptions() {
    
}

export function merge(cmd_opts: commander.Command)
{
    let output: { htrk_interface?: string, web_interface?: string } = {};

    if (!conf_file.network) conf_file.network = {};

    let htrk_if_opt: string
        = cmd_opts.htrkInterface || conf_file.network.htrk_interface
          || cmd_opts.interface || conf_file.network.interface;

    let webif_opt: string
        = cmd_opts.webInterface || conf_file.network.web_interface
          || cmd_opts.interface || conf_file.network.interface;

    const netifs = os.networkInterfaces();

    if (htrk_if_opt)
        output.htrk_interface = (net.isIP(htrk_if_opt))
                                    ? htrk_if_opt
                                    : getInterface(htrk_if_opt, netifs);

    if (webif_opt)
        output.web_interface = (net.isIP(webif_opt))
                                   ? webif_opt
                                   : getInterface(webif_opt, netifs);

    return output;
}
