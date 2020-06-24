import * as cp from 'child_process';
import {copyFile} from 'fs';
import * as os from 'os';
import { IPCBridge } from './ipc';
import { isIP } from 'net';
import { subnet } from 'ip';

export function applyMixins(derivedCtor: any, baseCtors: any[])
{
    baseCtors.forEach(baseCtor => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            Object.defineProperty(
                derivedCtor.prototype,
                name,
                Object.getOwnPropertyDescriptor(baseCtor.prototype, name));
        });
    });
}

export function openForUser(thing: string)
{
    if (os.type() == 'Windows_NT')
        cp.spawn('start');
    else if (os.type() == 'Darwin')
        cp.spawn('open', [ thing ]);
}

export function bitValue(bit: number): number
{
    return (1 << (bit))
}

export function arrayDiff<T>(base: Array<T>, excl: Array<T>): Array<T>
{
    let cpy  = Array.from(base);
    let ecpy = Array.from(excl);

    cpy.forEach(e => {
        let idx = ecpy.findIndex(k => k === e)
        if (idx != -1) ecpy.splice(idx, 1);
    })

    return ecpy;
}


export function localNetinfo(): Promise<{if: string, mask: number}[]>
{
    return new Promise((res, rej) => {
        if(os.type() == "Darwin") {

        }
    })
}

export function defaultIF(name?: string)
{
    return (name? name : "0.0.0.0"); 
}

const interfaces = os.networkInterfaces();
const local_interfaces: os.NetworkInterfaceInfo[] = [];

Object.keys(interfaces).forEach(function(ifname) {
    var alias = 0;
    interfaces[ifname].forEach(function(iface) {
        if ('IPv4' != iface.family || iface.internal) return;
        local_interfaces.push(iface);
        ++alias;
    });
});

export const LocalInterfaces = local_interfaces;

export function getMatchingLocalInterface(addr: string[])
{
    return LocalInterfaces.filter(ifs => {
        addr.forEach(a => {
            if(subnet(a, ifs.netmask) == subnet(ifs.address, ifs.netmask))
                return true;
        })
        return false;
    })
}

export function ignore(...any: any)
{
    // do nothing (magical.....)
}