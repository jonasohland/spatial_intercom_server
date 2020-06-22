import * as dnssd from 'dnssd'

export function getWebinterfaceAdvertiser(port: number, netif?: string)
{
    return new dnssd.Advertisement(dnssd.tcp('http'), port, { interface: netif, name: "Spatial Intercom Manager" });
}

export function getServerAdvertiser(port: number, netif?: string) 
{
    return new dnssd.Advertisement(dnssd.tcp('si-server'), port, { interface: netif });
}

export function getServerBrowser(netif?: string) 
{
    return new dnssd.Browser(dnssd.tcp('si-server'), { interface: netif });
}