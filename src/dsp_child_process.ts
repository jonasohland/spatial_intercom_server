import { ChildProcess, spawn } from 'child_process';
import { Interface as ReadLineInterface, createInterface } from 'readline';
import * as Logger from './log';
import * as os from 'os';
import * as fs from 'fs';
import { Options } from 'dnssd';

const log = Logger.get("DSPROC");

export class SIDSPProcess {

    constructor(options: any)
    {
        this._exec_location = options.dspExecutable;
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
            this.start().catch(err => {
                log.info("Could not restart DSP process: " + err);
            });
        });

        this._cp.on("error", code => {
            log.error("DSP process error: " + code);
        });

        this._cp.on("disconnect", () => {
            log.error("DSP process disconnect: ")
        });
    }
    
    private _exec_location: string;
    private _stdout_rl: ReadLineInterface;
    private _stderr_rl: ReadLineInterface;
    private _cp: ChildProcess;
}