export enum PortTypes {
    Any,
    Mono,
    Stereo,
    Quad,
    Surround_5_1,
    Surround_7_1,
    Surround_10_2,
    Surround_11_1,
    Surround_22_2,
    x3D_5_4_1,
    x3D_7_4_1,
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

export const PortTypeChannelCount = [
    1,      // Any
    1,      // Mono
    2,      // Stereo
    4,      // Quad
    6,      // 5.1
    8,      // 7.1
    12,     // 10.2
    12,     // 11.1
    24,     // 22.2
    10,     // 5.4.1
    12,     // 7.4.1
    8,      // 4.0.4
    1,      // Ambi O0
    4,      // Ambi O1
    9,      // Ambi O2
    16,     // Ambi O3
    25,     // Ambi O4
    36,     // Ambi O5
    49,     // Ambi O6
    64,     // Ambi O7
    81,     // Ambi O8
    100,    // Ambi O9
    121,    // Ambi O10
    144     // Ambi O11
];