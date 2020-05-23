"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
;
class SourceSet {
}
exports.SourceSet = SourceSet;
class SourceParameterSet {
}
exports.SourceParameterSet = SourceParameterSet;
class SoundSource {
    constructor(name, short, azm, elv) {
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
    static fromObj(obj) {
        return new SoundSource(obj.name, obj.short, obj.a, obj.e);
    }
}
exports.SoundSource = SoundSource;
let s = new SoundSource('Technik 1');
class MultichannelSoundSource extends SoundSource {
    constructor(source, type) {
        super(source.name, source.short, source.a, source.e);
    }
}
exports.MultichannelSoundSource = MultichannelSoundSource;
class SurroundSoundSource extends MultichannelSoundSource {
    constructor(base, type) {
        super(base, type);
    }
}
exports.SurroundSoundSource = SurroundSoundSource;
class SpatialSoundSource extends SurroundSoundSource {
    constructor(base, type) {
        super(base, type);
    }
}
exports.SpatialSoundSource = SpatialSoundSource;
//# sourceMappingURL=sources.js.map