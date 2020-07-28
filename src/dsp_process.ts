import { ChildProcess, spawn } from 'child_process';
import { Interface as ReadLineInterface, createInterface } from 'readline';
import * as Logger from './log';
import * as os from 'os';
import * as fs from 'fs';
import { SIServerWSSession, NodeMessageInterceptor, Message, Requester, Connection } from './communication'
import { IPCServer } from './ipc';
import { ignore, promisifyEventWithTimeout } from './util';

// i will have to write this myself
import eventToPromise from 'event-to-promise';
import { Node, NodeModule } from './core';
import { Graph } from './dsp_graph';
import { VSTScanner } from './vst';
import { DSPModuleNames } from './dsp_node';

const log = Logger.get("DSPROC");

export class LocalNodeController extends NodeMessageInterceptor {

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
        return "dsp-controller";
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
                return this._await_start(<number> msg.data);
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

    async _await_start(timeout: number = 10000)
    {
        if(this._ipc.connected())
            return true;

        if(this._exec_known) {
            log.info("Starting dsp process");
            this.start();
        }
        else
            log.warn("Could not find DSP executable. Waiting for external start");
        
        return promisifyEventWithTimeout(this._ipc, 'open', timeout);
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

export class DSPController extends NodeModule {

    destroy() {
        this._closed = true;
    }

    init(): void {
    }

    start(remote: Connection): void {

        this._remote = remote.getRequester('dsp-controller');
        this._remote_graph = remote.getRequester('graph');

        this._try_dsp_start().catch((err) => {
            log.error("DSP startup failed");
        });

        this._remote.on('dsp-started', () => {
            log.verbose('DSP startup event');
            this.events.emit('dsp-started');
            this._running = false;
        });

        this._remote.on('dsp-died', () => {
            log.verbose('DSP died event');
            this.events.emit('dsp-died');
            this._running = true;
        });

        this._remote_graph.on('connect-failed', () => {
            this._server._webif.broadcastWarning(this.myNode().name(), "Not all DSP objects could be connected correctly");
        });

        this._connection = remote;
        this._graph.attachConnection(remote);

        log.info("Graph service running");
    }

    joined(socket: SocketIO.Socket, topic: string)
    {

    }

    left(socket: SocketIO.Socket, topic: string)
    {
        
    }

    _remote: Requester;
    _remote_graph: Requester;
    _running: boolean;
    _closed: boolean = false;
    _graph: Graph;
    _vst: VSTScanner;
    _connection: Connection;

    constructor(vst: VSTScanner)
    {
        super(DSPModuleNames.DSP_PROCESS);
        this._vst = vst;
        this._graph = new Graph(vst);

        this._graph.setInputNode(128);
        this._graph.setOutputNode(128);
    }


    async syncGraph()
    {
        let self = this;

        return new Promise<void>((resolve, reject) => {
            log.info('Syncing graph with DSP process');

            self._remote_graph.request('set', this._graph._export_graph())
            .then(() => { log.info('Done Syncing')
                            resolve() })
            .catch(err => { log.error('Could not sync graph: ' + err.message)
                            reject() });
        });
    }


    // this is still not optimal
    // TODO: find a way to reject all returned promises
    // when the module is destroyed (connection is closed)
    async _try_dsp_start()
    {
        let is_started: boolean = false;
        
        while(!is_started && !this._closed) {
            try {
                await this._remote.requestTmt('await-start', 10000, 3000);
                is_started = true;
            } catch (err) {
                log.error('Still waiting for dsp start. Error: ' + err);
            }
        }

        if(!this._closed)
            this._running = true;
    }

    async waitStart()
    {
        if(this._running)
            return this._try_dsp_start();
    }

    graph() {
        return this._graph;
    }

    async resetGraph() {
        // await this._remote_graph.request('reset')
        this._graph.clear();
        this._graph.setInputNode(128);
        this._graph.setOutputNode(128);
    }
}