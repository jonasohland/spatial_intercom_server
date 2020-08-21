export interface Port {
    Node: number, Port: number, IsInput: boolean
}

export interface Crosspoint {
    Source: Port, Destination: Port
}

export interface CrosspointState {
    xp: Crosspoint, state: boolean
}

export interface CrosspointVolumeSource {
    xp: Crosspoint, conf: boolean
}

export interface CrosspointVolumeSourceState {
    xpid: string, state: boolean
}

export interface CrosspointVolumeTarget {
    xp: Crosspoint, conf: boolean, single: boolean, set: boolean
}

export interface CrosspointSync {
    state: boolean;
    vol: number;
    master: CrosspointVolumeSource;
    slaves: CrosspointVolumeTarget[];
}

export function xpEqual(lhs: Crosspoint, rhs: Crosspoint)
{
    return lhs.Source.Port == lhs.Destination.Port
           && lhs.Source.Node == lhs.Destination.Node
           && lhs.Source.IsInput == lhs.Destination.IsInput;
}

export function xpVtEqual(
    lhs: CrosspointVolumeTarget, rhs: CrosspointVolumeTarget)
{
    return xpEqual(lhs.xp, rhs.xp) && lhs.single === rhs.single
           && lhs.conf === rhs.conf;
}

export function __xpid(xp: Crosspoint)
{
    return `${xp.Source.Node}-${xp.Source.Port}-${
        xp.Source.IsInput ? 'i' : 'o'}|${xp.Destination.Node}-${
        xp.Destination.Port}-${xp.Destination.IsInput ? 'i' : 'o'}`
}

export function xpvtid(xp_vt: CrosspointVolumeSource)
{
    return __xpid(xp_vt.xp) + (xp_vt.conf ? '-conf' : '-single');
}
