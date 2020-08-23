import _ajv from 'ajv';
import fs from 'fs';

const ajv = _ajv();

export enum Validators {
    CrosspointSync,
    AddCrosspointVolumeTargetMessage,
    XPSyncModifySlavesMessage
}

export function getValidator(validator: Validators) {
    return ajv.compile(
        JSON.parse(fs.readFileSync(`${__dirname}/schemas/${Validators[validator]}.schema.json`).toString()));
}