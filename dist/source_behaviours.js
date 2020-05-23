"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dsp_1 = require("./dsp");
class SourceBehaviour {
}
exports.SourceBehaviour = SourceBehaviour;
class MonoSourceBehaviour extends SourceBehaviour {
    constructor() {
        super();
    }
    buildSourceSet(params) {
        return { default: [{ a: params.a, e: params.e }] };
    }
}
exports.MonoSourceBehaviour = MonoSourceBehaviour;
class StereoSourceBehaviour extends SourceBehaviour {
    constructor(ty) {
        super();
    }
    buildSourceSet(params) {
        return {
            lows: {
                front: [
                    {
                        a: 0,
                        e: 0
                    },
                    {
                        a: 1,
                        e: 1
                    }
                ]
            }
        };
    }
}
exports.StereoSourceBehaviour = StereoSourceBehaviour;
class SurroundSourceBehaviour extends SourceBehaviour {
    constructor(ty) {
        super();
    }
    buildSourceSet(params) {
        return {};
    }
}
exports.SurroundSourceBehaviour = SurroundSourceBehaviour;
class X3DSourceBehaviour extends SourceBehaviour {
    constructor(ty) {
        super();
    }
    buildSourceSet(params) {
        return {};
    }
}
exports.X3DSourceBehaviour = X3DSourceBehaviour;
exports.SourceSets = {
    [dsp_1.PortTypes.Mono]: new MonoSourceBehaviour(),
    [dsp_1.PortTypes.Stereo]: new StereoSourceBehaviour(dsp_1.PortTypes.Stereo),
    [dsp_1.PortTypes.Surround_5_1]: new SurroundSourceBehaviour(dsp_1.PortTypes.Surround_5_1),
    [dsp_1.PortTypes.x3D_5_4_1]: new X3DSourceBehaviour(dsp_1.PortTypes.x3D_5_4_1)
};
//# sourceMappingURL=source_behaviours.js.map