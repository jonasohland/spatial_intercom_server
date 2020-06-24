import { NodeIdentification } from './communication'

export class NodeConfigDataSet<DataTypeEnum extends number> {
    type: DataTypeEnum;
}

export class NodeConfig<DataTypeEnum extends number> {

    id: NodeIdentification;
    data: NodeConfigDataSet<DataTypeEnum>[];

    get(type: DataTypeEnum)
    {
        return this.data[type];
    }
}

export class Configuration {

}

enum testenum {
    one, two
}

export class ConfigManager {

    constructor()
    {
    }
}