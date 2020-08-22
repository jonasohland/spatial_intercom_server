import * as dnssd from 'mdns';
import * as Logger from './log';

const log = Logger.get('DISCVY');

export function getWebinterfaceAdvertiser(port: number, netif?: string)
{
    let advertisement = new dnssd.Advertisement(dnssd.tcp('http'), port, { networkInterface: netif, name: "Spatial Intercom Manager", txtRecord: {path: "/admin/settings"} });
    advertisement.on('error', err => log.error(`MDNS-SD [${dnssd.tcp('http').name}] advertisement error ${err}`));
    return advertisement
}

export function getServerAdvertiser(port: number, netif?: string) 
{
    let advertisement = new dnssd.Advertisement(dnssd.tcp('si-server'), port, { networkInterface: netif });
    advertisement.on('error', err => log.error(`MDNS-SD [${dnssd.tcp('si-server').name}] advertisement error ${err}`));
    return advertisement;
}

export function getServerBrowser(netif?: string) 
{
    let browser = new dnssd.Browser(dnssd.tcp('si-server'), { networkInterface: netif });
    browser.on('error', (err: any) => log.error(`MDNS-SD browser [${dnssd.tcp('si-server').name}] error ` + err));
    return browser;
}