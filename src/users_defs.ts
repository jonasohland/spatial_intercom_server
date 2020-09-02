import { v4 as uniqueId } from 'uuid';
import { NodeAudioInputDescription } from "./inputs_defs";
import { PortTypes, SourceUtils } from './dsp_defs';
import { NumberFormatDefinition } from 'ajv';
import { Port } from './rrcs_defs';

export interface SpatializedInputData {
    id: string,
    inputid: string,
    userid: string,
    room: string,
    azm: number,
    elv:  number,
    gain: number,
    height?: number,
    width?: number,
}


export interface XTCSettings {
    accuracy: number;
    enabled_st: boolean;
    enabled_bin: boolean;
    dist_spk: number;
    dist_ears: number;
    dist_listener: number;
}

export interface UserData {
    name: string;
    id: string;
    channel: number;
    headtracker: number;
    room?: string;
    xtc: XTCSettings;
    artist: ArtistSyncSettings;
    inputs: string[];
}

export interface UserAddInputsMessage {
    userid: string, 
    inputs: NodeAudioInputDescription[]
}

export interface UserDeleteInputMessage {
    userid: string,
    input: SpatializedInputData
}

export interface UserModifyInputMessage {
    userid: string,
    recompile: boolean,
    input: SpatializedInputData
}

export interface UserPanInputMessage {
    userid: string;
    spid: string,
    value: number
}

export interface UserAssignHeadtrackerMessage {
    userid: string,
    headtrackerid: number
}

export interface UserInputGainChangeMessage {
    gain: number,
    id: string,
    user: string
}

export interface UserModifyXTCMessage {
    xtc: XTCSettings,
    user: string
}

export interface ManagedPort {
    port: Port;
    input: SpatializedInputData
}

export interface ArtistSyncSettings {
    settings: {
        node: number,
        first_port: number,
        last_port: number,
        first_device_channel: number
    }
    user_panel: Port
}

export function basicArtistSyncSettings(panel?: Port): ArtistSyncSettings {
    return {
        settings: {
            node: -1,
            first_port: 0,
            last_port: 0,
            first_device_channel: 0
        },
        user_panel: panel
    }
}

export function basicSpatializedInput(inputid: string, userid: string, type: PortTypes): SpatializedInputData {
    let defaultSource = SourceUtils[type].defaults();
    return {
        inputid, userid,
        id: uniqueId(),
        gain: 0,
        room: null,
        azm: defaultSource.a,
        elv: defaultSource.e,
        width: defaultSource.width,
        height: defaultSource.height
    }
}

export function basicXTCData()
{
    return {
        enabled_bin: false,
        enabled_st: false,
        accuracy: 1000,
        dist_spk: 42,
        dist_ears: 21.5,
        dist_listener: 60
    }
}

export function basicUserData(name: string, channel: number, panel?: Port): UserData {
    return {
        name,
        channel,
        id: uniqueId(),
        headtracker: -1,
        inputs: [],
        room: "null",
        xtc: basicXTCData(),
        artist: basicArtistSyncSettings(panel)
    }
}