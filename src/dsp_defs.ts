import { Port } from "./dsp_graph";

export enum PortTypes {
    Any,
    Mono,
    Stereo,
    Quad,
    Surround_5_1,
    Surround_7_1,
    x3D_5_4_1,
    x3D_4_0_4,
    Ambi_O0,
    Ambi_O1,
    Ambi_O2,
    Ambi_O3,
    Ambi_O4,
    Ambi_O5,
    Ambi_O6,
    Ambi_O7,
    Ambi_O8,
    Ambi_O9,
    Ambi_O10,
    Ambi_O11
}

export function isAmbi(ty: PortTypes)
{
    return ty >= PortTypes.Ambi_O0;
}

export function stringToPortType(str: string)
{
    switch (str.toLocaleLowerCase()) {
        case 'mono': return PortTypes.Mono;
        case 'st': return PortTypes.Stereo;
        case 'stereo': return PortTypes.Stereo;
        case 'surround': return PortTypes.Surround_5_1;
        case '5.1': return PortTypes.Surround_5_1;
        case '5_1': return PortTypes.Surround_5_1;
        default: return PortTypes.Any;
    }
}

export interface Source {
    a: number,
    e: number,
}

export interface SourceParameterSet {
    a: number,
    e: number,
    height?: number,
    width?: number
};

export type PanFunction = (params: SourceParameterSet) => Source[];
export type SourceParameterSetDefaultsGenerator = () => SourceParameterSet;

function _basic_defaults() : SourceParameterSet {
    return { a: 0, e: 0 };
}

function _basic_defaults_generator(width: number, height?: number): SourceParameterSetDefaultsGenerator {
    return function() {
        return {
            a: 0,
            e: 0,
            width,
            height
        }
    }
}

function _panfunction_any(params: SourceParameterSet) : Source[] {
    return [ { a: params.a, e: params.e } ];
}

function _panfunction_mono(params: SourceParameterSet) : Source[] {
    return [ { a: params.a, e: params.e } ];
}

function _panfunction_stereo(params: SourceParameterSet): Source[] {
    
    params.width = params.width || 0;

    let aL = params.a - (params.width / 2);
    let aR = params.a + (params.width / 2);

    return [{a: aL, e: params.e}, {a: aR, e: params.e}];
}


function _panfunction_quad(params: SourceParameterSet): Source[] {
    return [
        {a: params.a - 45, e: params.e},
        {a: params.a + 45, e: params.e},
        {a: params.a - 135, e: params.e},
        {a: params.a + 135, e: params.e},
    ]
}

function _panfunction_surround_5_1(params: SourceParameterSet): Source[] {
    return [ 
        {a: params.a - (params.width / 2), e: params.e},
        {a: params.a + (params.width / 2), e: params.e},
        {a: params.a, e: params.e},
        {a: params.a, e: params.e},
        {a: params.a - 110, e: params.e},
        {a: params.a + 110, e: params.e},
    ];
}


export const SourcePanFunctions = [
    _panfunction_any,
    _panfunction_mono,
    _panfunction_stereo,
    _panfunction_quad,
];

export const SourceParameterSetDefaults: SourceParameterSetDefaultsGenerator[] = [
    _basic_defaults,
]

export interface SourceUtil {
    pan: PanFunction,
    channels: number,
    defaults: SourceParameterSetDefaultsGenerator
}

// clang-format off

export const SourceUtils: Record<PortTypes, SourceUtil> = {
    [PortTypes.Any]:            { channels: 1, pan: _panfunction_any, defaults: _basic_defaults },
    [PortTypes.Mono]:           { channels: 1, pan: _panfunction_mono, defaults: _basic_defaults },
    [PortTypes.Stereo]:         { channels: 2, pan: _panfunction_stereo, defaults: _basic_defaults_generator(90) },
    [PortTypes.Quad]:           { channels: 4, pan: _panfunction_quad, defaults: _basic_defaults },
    [PortTypes.Surround_5_1]:   { channels: 6, pan: _panfunction_surround_5_1, defaults: _basic_defaults_generator(60) },
    [PortTypes.Surround_7_1]:   { channels: 8, pan: _panfunction_any, defaults: _basic_defaults_generator(30) },
    [PortTypes.x3D_4_0_4]:      { channels: 8, pan: _panfunction_any, defaults: _basic_defaults },
    [PortTypes.x3D_5_4_1]:      { channels: 10, pan: _panfunction_any, defaults: _basic_defaults_generator(30) },
    [PortTypes.Ambi_O0]:        { channels: 1, pan: _panfunction_any, defaults: _basic_defaults },
    [PortTypes.Ambi_O1]:        { channels: 4, pan: _panfunction_any, defaults: _basic_defaults },
    [PortTypes.Ambi_O2]:        { channels: 9, pan: _panfunction_any, defaults: _basic_defaults },
    [PortTypes.Ambi_O3]:        { channels: 16, pan: _panfunction_any, defaults: _basic_defaults },
    [PortTypes.Ambi_O4]:        { channels: 25, pan: _panfunction_any, defaults: _basic_defaults },
    [PortTypes.Ambi_O5]:        { channels: 36, pan: _panfunction_any, defaults: _basic_defaults },
    [PortTypes.Ambi_O6]:        { channels: 49, pan: _panfunction_any, defaults: _basic_defaults },
    [PortTypes.Ambi_O7]:        { channels: 64, pan: _panfunction_any, defaults: _basic_defaults },
    [PortTypes.Ambi_O8]:        { channels: 81, pan: _panfunction_any, defaults: _basic_defaults },
    [PortTypes.Ambi_O9]:        { channels: 100, pan: _panfunction_any, defaults: _basic_defaults },
    [PortTypes.Ambi_O10]:       { channels: 121, pan: _panfunction_any, defaults: _basic_defaults },
    [PortTypes.Ambi_O11]:       { channels: 144, pan: _panfunction_any, defaults: _basic_defaults },
};

// clang-format on