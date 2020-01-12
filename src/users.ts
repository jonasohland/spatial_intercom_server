import * as Instance from './instance'
import EventEmitter from 'events';
import * as Audio from './audio_devices'
import * as DSP from './dsp'
import * as Inputs from './inputs'

interface OwnedInput {
    input: Inputs.Input;
    azm: number;
    elv: number;
    mute: boolean;
};

interface WEBIFNewUserData {
    username: string;
    node: string
    channels: Audio.Channel;
};

interface WEBIFUserData {
    id: number;
    name: string;
    nodename: string;
    nid: string;
    advanced: boolean;
    selected_inputs: [];
    inputs: OwnedInput[];
};

export class UsersManager extends EventEmitter {

    si: Instance.SpatialIntercomInstance;
    users: User[];
    current_id: 0;

    constructor(ins: Instance.SpatialIntercomInstance)
    {
        super();
        this.si = ins;
    }

    addUser(userdata: WEBIFNewUserData) 
    {
        let new_user = new User(this.si, userdata.username);

        new_user.id = ++this.current_id;
        new_user.advanced = false;

        this.users.push(new_user);
    }
}

export class User {

    id: number;
    name: string;
    node: Instance.SpatialIntercomInstance;
    advanced: boolean;
    inputs: [];

    constructor(instance: Instance.SpatialIntercomInstance, name: string) 
    {
        
    }
}