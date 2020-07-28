import {loopback} from 'ip';
import {RRCS_Client, RRCS_Server} from 'riedel_rrcs';

import {ServerModule} from './core';
import * as Logger from './log';
import { HeadtrackerInputEvents } from './headtracking';

const log = Logger.get('RRCSSV');

export class RRCSModule extends ServerModule {

    rrcssrv: RRCS_Server;

    init()
    {
    }

    joined(socket: SocketIO.Socket)
    {
    }

    left(socket: SocketIO.Socket)
    {
    }

    constructor(config: any)
    {
        super('rrcs');
        console.log(config);

        if (config.rrcs) {
            this.rrcssrv
                = new RRCS_Server({ ip : '0.0.0.0', port : 6870 },
                                  { ip : config.rrcs, port : 8193 }, this);
        }
    }

    processStringCommand(str: string)
    {
        let cmd = str.split('-');

        switch(cmd.shift()) {
            case 'headtracker':
                this.processHeadtrackerCommand(cmd);
                break;
        }
    }

    processHeadtrackerCommand(cmd: string[])
    {
        let id = Number.parseInt(cmd[1]);
        switch(cmd.shift()) {
            case 'reset': 
                this.events.emit(HeadtrackerInputEvents.RESET_HEADTRACKER, id);
                break;
            case 'init':
                this.events.emit(HeadtrackerInputEvents.CALIBRATE_STEP1, id);
                break; 
            case 'on':
                this.events.emit(HeadtrackerInputEvents.HEADTRACKER_ON, id);
                break;
            case 'off': 
                this.events.emit(HeadtrackerInputEvents.HEADTRACKER_OFF, id);
        }
    }

    processHeadtrackerOffCommand(cmd: string[]) 
    {
        let id = Number.parseInt(cmd[1]);
        switch(cmd.shift()) {
            case 'init': 
                this.events.emit(HeadtrackerInputEvents.CALIBRATE_STEP2, id);
                break;
        }
    }

    processStringOffCommand(str: string)
    {
        let cmd = str.split('-');

        switch(cmd.shift()) {
            case 'headtracker':
                this.processHeadtrackerOffCommand(cmd);
                break;
        }
    }

    /**
     * RRCS handlers
     */
    initial(msg: any, error: any)
    {
        console.log(msg);
        console.log(error);
    }
    log(msg: any)
    {
        log.info(msg);
    }
    error(err: any)
    {
        log.error(err);
    }
    getAlive(msg: any)
    {
        return true;
    }
    crosspointChange(params: any)
    {
    }
    sendString(params: any)
    {
        try {
            this.processStringCommand(params[1]);
        } 
        catch (err) {
            log.error(`Could not process string command from artist: ` + err);
        }
    }
    sendStringOff(params: any)
    {
        try {
            this.processStringOffCommand(params[1]);
        } 
        catch (err) {
            log.error(`Could not process string-off command from artist: ` + err);
        }
    }
    gpInputChange(params: any)
    {
    }
    logicSourceChange(params: any)
    {
    }
    configurationChange(params: any)
    {
    }
    upstreamFailed(params: any)
    {
    }
    upstreamFaieldCleared(params: any)
    {
    }
    downstreamFailed(params: any)
    {
    }
    downstreamFailedCleared(params: any)
    {
    }
    nodeControllerFailed(params: any)
    {
    }
    nodeControllerReboot(params: any)
    {
    }
    clientFailed(params: any)
    {
    }
    clientFailedCleared(params: any)
    {
    }
    portInactive(params: any)
    {
    }
    portActive(params: any)
    {
    }
    connectArtistRestored(params: any)
    {
    }
    connectArtistFailed(params: any)
    {
    }
    gatewayShutdown(params: any)
    {
    }
    notFound(params: any)
    {
    }
}