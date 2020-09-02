import _ajv from 'ajv';
import fs from 'fs';
import * as Logger from './log';

const log = Logger.get('VALIDR');

const ajv = _ajv({ verbose: true, logger: log, format: 'full' });

export enum Validators {
    CrosspointSync,
    AddCrosspointVolumeTargetMessage,
    XPSyncModifySlavesMessage,
    UserData
}

export function getValidator(validator: Validators) {
    return ajv.compile(
        JSON.parse(fs.readFileSync(`${__dirname}/schemas/${Validators[validator]}.schema.json`).toString()));
}