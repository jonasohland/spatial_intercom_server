import * as IPC from './ipc'
import { threadId } from 'worker_threads';
import { Requester, Connection } from './communication';

export class DSPHost {

    remote: Requester;

    constructor(con: Connection) {
        this.remote = con.getRequester('dsp');
    }

    async enable() {
        return this.remote.set('enable');
    }

    async disable() {
        return this.remote.set('disable');
    }
}