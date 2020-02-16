import * as dnssd from 'dnssd'

export function getWebinterfaceAdvertiser(netif?: string)
{
    return new dnssd.Advertisement(dnssd.tcp('http'), 8090, { interface: netif, name: "Spatial Intercom Manager" });
}

export function getServerAdvertiser(netif?: string) 
{
    return new dnssd.Advertisement(dnssd.tcp('si-server'), 45045, { interface: netif });
}

export function getServerBrowser(netif?: string) 
{
    return new dnssd.Browser(dnssd.tcp('si-server'), { interface: netif });
}