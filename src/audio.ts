import * as IPC from './ipc'
import { threadId } from 'worker_threads';

export class DSPHost {

    remote: IPC.Requester;

    constructor(con: IPC.Connection) {
        this.remote = con.getRequester('dsp');
    }

    async enable() {
        return this.remote.set('enable');
    }

    async disable() {
        return this.remote.set('disable');
    }
}