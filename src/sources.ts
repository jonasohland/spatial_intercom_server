import { PortTypes } from './dsp';

export interface Source {
    a: number;
    e: number;
};

export class SourceSet {
    
    lows?: {
        front?: Source[]
        back?: Source[]
    }

    heights?: {
        front?: Source[]
        back?: Source[]
    }

    default?: Source[]
    aux?: Source[]

}

export class SourceParameterSet {

    height?: number

    lowFrontWidth?: number
    lowBackWidth?: number
    highFrontWidth?: number
    highBackWidth?: number 

    a: number
    e: number

}

export class SoundSource {

    name: string;
    short: string;
    a: number;
    e: number;

    sources: Source[];

    constructor(name: string, short?: string, azm?: number, elv?: number)
    {
        if (!short) {

            let end_num = name.match(/\d+$/);

            if (end_num)
                this.short = name.slice(0, 1).toUpperCase() + end_num[0];
            else
                this.short = name.slice(0, 2).toUpperCase();
        }

        this.a = azm || 0;
        this.e = elv || 0;
    }

    static fromObj(obj: any)
    {
        return new SoundSource(obj.name, obj.short, obj.a, obj.e);
    }
}

let s = new SoundSource('Technik 1');

export class MultichannelSoundSource extends SoundSource {

    ptype: PortTypes;

    constructor(source: SoundSource, type?: PortTypes)
    {
        super(source.name, source.short, source.a, source.e);
    }
}

export class SurroundSoundSource extends MultichannelSoundSource {

    spread_front: number;
    spread_back: number;

    constructor(base: SoundSource, type: PortTypes)
    {
        super(base, type);
    }
}

export class SpatialSoundSource extends SurroundSoundSource {

    height: number;

    constructor(base: SoundSource, type: PortTypes)
    {
        super(base, type);
    }
}