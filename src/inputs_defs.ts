import { v4 as uniqueId } from 'uuid';
import { PortTypes } from './dsp_defs'

export interface NodeAudioInputDescription {
    name: string;
    channel: number;
    type: PortTypes;
    id: string;
    default_roomencode: boolean;
    default_encodingorder: number;
    default_gain: number;
}


export function basicNodeAudioInputDescription(
    name: string, channel: number,
    type: PortTypes): NodeAudioInputDescription
{
    return {
        name,
        channel,
        type,
        id : uniqueId(),
        default_roomencode : false,
        default_encodingorder : 3,
        default_gain : 1.
    };
}