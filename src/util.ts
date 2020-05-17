import * as os from 'os';
import * as cp from 'child_process';

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

export function openForUser(thing: string) {
    if(os.type() == 'Windows_NT')
        cp.spawn('start');
    else if(os.type() == 'Darwin')
        cp.spawn('open', [thing]);
}

export function bitValue(bit: number): number {
    return (1 << (bit))
}