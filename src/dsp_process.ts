import { ChildProcess, spawn } from 'child_process';
import { Interface as ReadLineInterface, createInterface } from 'readline';
import * as Logger from './log';
import * as os from 'os';
import * as fs from 'fs';
import { SIServerWSSession, NodeMessageInterceptor } from './communication'
import { Message, IPCServer } from './ipc';
import { ignore, promisifyEventWithTimeout } from './util';

// i will have to write this myself
import eventToPromise from 'event-to-promise';
import { runInThisContext } from 'vm';

const log = Logger.get("DSPROC");

export class SIDSPProcess extends NodeMessageInterceptor {

    private _autorestart: boolean;
    private _exec_known: boolean;
    private _exec_location: string;
    private _stdout_rl: ReadLineInterface;
    private _stderr_rl: ReadLineInterface;
    private _cp: ChildProcess;
    private _ipc: IPCServer;

    constructor(options: any, ipc: IPCServer)
    {
        super();
        this._exec_location = options.dspExecutable;
        this._ipc = ipc;
        this._autorestart = true;

        this._ipc.on('open', () => {
            this.event('dsp-started');
        });

        this._ipc.on('closed', () => {
            this.event('dsp-died');
        });

        try {
            if(fs.existsSync(this.getDSPProcessCommmand()))
                this._exec_known = true;
            else
                this._exec_known = false;
        } catch (err) {
            log.warn("Could not find executable: " + err);
            this._exec_known = false;
        }
    }

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
                return this._ipc._pipe != null;
            case "restart":
                return this._restart();
            case "await-start":
                return this._await_start();
            case "external":
                return this._exec_known == false;
            default: 
            throw "Unknown message";
        }
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

    async _await_start()
    {
        if(this._ipc.connected())
            return true;

        if(this._exec_known) {
            log.info("Starting dsp process");
            this.start();
        }
        else
            log.warn("Could not find DSP process. Waiting for external start");
        
        return promisifyEventWithTimeout(this._ipc, 'open', 60000);
    } 

    async _restart()
    {
        if(!this._exec_known)
            throw "DSP Process is running externally";

        if(this._cp){
            this._autorestart = true;
            await this.kill();
            await eventToPromise(this._ipc, 'open');
            return ignore(log.info("DSP process started"));
        }
        else
            throw "Not running";
    }

    async kill()
    {
        if(!this._exec_known)
            throw "DSP Process is running externally";

        log.info("Killing DSP process");
        this._cp.kill();
        await promisifyEventWithTimeout<void>(this._cp, 'close', 1000);
        log.info("DSP process killed.")
    }

    async start()
    {
        if(!this._exec_known)
            throw "Executable location unknown. DSP process must be started externally";

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

}

export class RemoteDSPProcessController {

    _session: SIServerWSSession;

    constructor(session: SIServerWSSession)
    {
        this._session = session;
    }

    async restart()
    {

    }
}