import * as mdns from 'dnssd'

export function getServerAdvertiser(netif?: string) 
{
    return new mdns.Advertisement(mdns.tcp('si-server'), 45045, { interface: netif });
}

export function getServerBrowser(netif?: string) 
{
    return new mdns.Browser(mdns.tcp('si-server'), { interface: netif });
}