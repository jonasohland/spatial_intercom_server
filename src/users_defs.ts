import { v4 as uniqueId } from 'uuid';
import { NodeAudioInputDescription } from "./inputs_defs";
import { PortTypes, SourceUtils } from './dsp_defs';
import { NumberFormatDefinition } from 'ajv';

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
    room: string;
    xtc: XTCSettings;
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

export function basicUserData(name: string, channel: number): UserData {
    return {
        name,
        channel,
        id: uniqueId(),
        headtracker: -1,
        inputs: [],
        room: null,
        xtc: basicXTCData()
    }
}