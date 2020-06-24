import { ChildProcess, spawn } from 'child_process';
import { Interface as ReadLineInterface, createInterface } from 'readline';
import * as Logger from './log';
import * as os from 'os';
import * as fs from 'fs';
import { SIServerWSSession, NodeMessageInterceptor } from './communication'
import { Message, IPCServer } from './ipc';
import { ignore } from './util';

// i will have to write this myself
import eventToPromise from 'event-to-promise';

const log = Logger.get("DSPROC");

export class SIDSPProcess extends NodeMessageInterceptor {

    target(): string {
        return "node-controller";
    }

    async handleMessage(msg: Message, from_ipc: boolean) {
        if(from_ipc) {
            ignore(log.error("Received a message from IPC. Thats not what we signed up for."));
            throw "Unexpected message";
        }

        switch(msg.field) {
            case "is-started":
                return this._cp != null;
            case "restart":
                return this._restart();
            default: 
            throw "Unknown message";
        }
    }

    constructor(options: any, ipc: IPCServer)
    {
        super();
        this._exec_location = options.dspExecutable;
        this._ipc = ipc;
    }

    getDSPExecutablePath()
    {
        let basepath = this._exec_location || process.env.SI_DSP_EXEC_LOCATION;

        if(!basepath){
            if(os.type() == "Darwin")
                basepath = process.cwd() + "/sidsp.app";
            else if(os.type() == "Windows_NT")
                basepath = process.cwd() + "/sidsp.exe";
            else
                basepath = process.cwd() + "/sidsp";
        }

        return fs.realpathSync(basepath);
    }

    getDSPProcessCommmand()
    {
        let base = this.getDSPExecutablePath() + "";
        log.info("Looking for executable in " + base);

        if(os.type() == "Darwin")
            base += "/Contents/MacOS/sidsp";

        return base;
    }

    async _restart()
    {
        if(this._cp){
            this._autorestart = true;
            log.info("Killing DSP process");
            await this.kill();
            await eventToPromise(this._ipc, 'open');
            return ignore(log.info("DSP process started"));
        }
        else
            throw "Not running";
    }

    async kill()
    {
        this._cp.kill();
        await eventToPromise(this._cp, 'close');
        log.info("DSP process killed.")
    }

    async start()
    {
        this._cp = spawn(this.getDSPProcessCommmand())

        this._stdout_rl = createInterface({
            input: this._cp.stdout
        });

        this._stderr_rl = createInterface({
            input: this._cp.stderr
        });

        this._stdout_rl.on('line', line => {
            log.info(line);
        })

        this._stderr_rl.on('line', line => {
            log.warn(line);
        })

        this._cp.on('close', errc => {
            log.error(`DSP process died. Return code: ${errc}  --- Restaring`);
            if(this._autorestart) {
                this.start().catch(err => {
                    log.info("Could not restart DSP process: " + err);
                });
            }
        });

        this._cp.on("error", code => {
            log.error("DSP process error: " + code);
        });

        this._cp.on("disconnect", () => {
            log.error("DSP process disconnect: ")
        });
    }
    
    private _autorestart: boolean;
    private _exec_location: string;
    private _stdout_rl: ReadLineInterface;
    private _stderr_rl: ReadLineInterface;
    private _cp: ChildProcess;
    private _ipc: IPCServer;
}

export class RemoteDSPProcess {

    _session: SIServerWSSession;

    constructor(session: SIServerWSSession)
    {
        this._session = session;
    }

    async restart()
    {

    }
}