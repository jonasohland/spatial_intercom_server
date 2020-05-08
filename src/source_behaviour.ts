import {PortTypes} from './dsp';
import {SoundSource, Source, SourceParameterSet, SourceSet} from './sources'

export abstract class SourceBehaviour {
    abstract buildSourceSet(params: SourceParameterSet): SourceSet;
}

export class MonoSourceBehaviour extends SourceBehaviour {
    
    constructor()
    {
        super();
    }

    buildSourceSet(params: SourceParameterSet): SourceSet
    {
        return { default : [ { a : params.a, e : params.e } ] };
    }
}

export class StereoSourceBehaviour extends SourceBehaviour {

    constructor(ty: PortTypes)
    {
        super();
    }

    buildSourceSet(params: SourceParameterSet): SourceSet
    {
        return {
            lows: {
                front: [
                    {
                        a: 0,
                        e: 0
                    },
                    {
                        a: 1,
                        e:1
                    }
                ]
            }
        }
    }
}

export class SurroundSourceBehaviour extends SourceBehaviour {

    constructor(ty: PortTypes)
    {
        super();
    }

    buildSourceSet(params: SourceParameterSet): SourceSet
    {
        return {}
    }
}

export class X3DSourceBehaviour extends SourceBehaviour {

    constructor(ty: PortTypes)
    {
        super();
    }

    buildSourceSet(params: SourceParameterSet): SourceSet
    {
        return {}
    }
}

export type SourceSetsType = {
    [key in PortTypes]?: SourceBehaviour
}

export const SourceSets: SourceSetsType
    = {
          [PortTypes.Mono]: new MonoSourceBehaviour(),
          [PortTypes.Stereo]: new StereoSourceBehaviour(PortTypes.Stereo),
          [PortTypes.Surround_5_1]:
              new SurroundSourceBehaviour(PortTypes.Surround_5_1),
          [PortTypes.x3D_5_4_1]: new X3DSourceBehaviour(PortTypes.x3D_5_4_1)
      };
