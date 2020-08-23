#!/bin/bash

types=(CrosspointSync AddCrosspointVolumeTargetMessage XPSyncModifySlavesMessage)
pids=()

mkdir -p dist/src/schemas

for i in "${!types[@]}"
do
    echo "Generate schema for type ${types[$i]}"
    ts-json-schema-generator -f "tsconfig.json" --type ${types[$i]}  -o dist/src/schemas/${types[$i]}.schema.json &
    pids[$i]=$!
done
wait ${pids[*]}