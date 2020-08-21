import _ajv from 'ajv';
import fs from 'fs';

const ajv = _ajv();

export enum Validators {
    CrosspointSync
}

const Schemas: Record<Validators, string> = {
    [Validators.CrosspointSync] :
        __dirname + '/schemas/CrosspointSync.schema.json'
}

export function getValidator(validator: Validators) {
    return ajv.compile(
        JSON.parse(fs.readFileSync(Schemas[validator]).toString()));
}