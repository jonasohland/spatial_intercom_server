import {loopback} from 'ip';
import {RRCS_Client, RRCS_Server, RRCSServerType} from 'riedel_rrcs';

import {ServerModule} from './core';
import * as Logger from './log';
import { HeadtrackerInputEvents } from './headtracking';
import { createSocket, Socket } from 'dgram';
import { OSCMessage, toBuffer } from 'osc-min';

const log = Logger.get('RRCSSV');

export class RRCSModule extends ServerModule {

    rrcssrv: RRCSServerType;
    local_sock: Socket;
    config: any;

    init()
    {
        this.handleGlobalWebInterfaceEvent('reconnect-rrcs', (socket, data) => {
            log.info("Reconnect RRCS");
            this.reconnectRRCS();
        });
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
        this.config = config;

        this.local_sock = createSocket('udp4', (msg, rinfo) => {

        });

        this.local_sock.on('error', (err) => {
            log.error("RRCS to OSC socket error: " + err);
        });

        this.local_sock.on('close', () => {
            log.warn("RRCS to OSC socket closed");
        });

        this.reconnectRRCS();
    }

    reconnectRRCS() 
    {   
        if (this.config) {
            if(this.rrcssrv) {
                this.rrcssrv.server.httpServer.close();
                this.rrcssrv.server.httpServer.on('close', () => {
                    log.warn('RRCS Server closed');
                    this.startRRCS();
                });
            } else
                this.startRRCS();
        }
    }

    startRRCS() {
        this.rrcssrv = RRCS_Server({ ip : '0.0.0.0', port : 6870 },
                    { ip : this.config.rrcs, port : 8193 }, this);
    }

    processOSCCommand(cmd: string[])
    {
        let ccmd = cmd[0].split(' ');
        let addr = ccmd.shift();
        let msg: OSCMessage = {
            address: addr,
            oscType: 'message',
            args: []
        }

        ccmd.forEach(arg => {
            try {
                if(/^\d+$/.test(arg)) {
                    msg.args.push({
                        type: 'integer',
                        value: Number.parseInt(arg)
                    });
                } else if (!isNaN(<number> <unknown> arg)) {
                    msg.args.push({
                        type: 'float',
                        value: Number.parseFloat(arg)
                    });
                } else {
                    msg.args.push({
                        type: 'string',
                        value: arg
                    });
                }
            }   
            catch(err) {
                log.error("Could not convert arg to OSC Type " + err);
            }

            this.local_sock.send(toBuffer(msg), this.config.rrcs_osc_port, this.config.rrcs_osc_host);
        });
    }

    processStringCommand(str: string)
    {
        let cmd = str.split('-');

        switch(cmd.shift()) {
            case 'headtracker':
                this.processHeadtrackerCommand(cmd);
                break;
            case 'osc': 
                this.processOSCCommand(cmd);
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
        this.webif.broadcastNotification('RRCS', msg);
        if (error)
            console.log(error);
    }
    log(msg: any)
    {
        if(this.webif)
            this.webif.broadcastNotification('RRCS', msg);
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