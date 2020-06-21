import * as cp from 'child_process';
import {EventEmitter} from 'events';
import * as os from 'os';
import * as readline from 'readline';
import * as Logger from './log';
import { SIGINT } from 'constants';
import { Connection, Requester } from './ipc';

const log = Logger.get('TIMECD');

export async function devices(): Promise<string[]>
{
    return new Promise((res, rej) => {
        let proc = cp.spawn(
            'ffmpeg',
            [ '-f', 'avfoundation', '-list_devices', 'true', '-i', '' ]);

        const rl = readline.createInterface({ input : proc.stderr });

        const total_devices: string[] = [];
        const vdev: string[]          = [];
        const adev: string[]          = [];

        rl.on('line', (line) => {
            let match = line.match(/(\[[0-9]\] [^\n]*)/g);
            if (match)
                total_devices.push(match[0]);
        })

        proc.on('close', (code) => {
            let parse_adev = 0;
            total_devices.forEach((dev => {
                let numc = dev.match(/\[([0-9])\]/g);
                if (numc) {

                    let num = numc[0].match(/[0-9]/g);
                    if (num) {

                        let idx    = Number.parseInt(num[0]);
                        let devarr = dev.split(']');
                        let devstr = devarr[devarr.length - 1].trim();

                        if (idx === 0)
                            ++parse_adev;

                        if (parse_adev < 2)
                            vdev.push(devstr);
                        else
                            adev.push(devstr);
                    }
                }
            }));

            if (adev.length === 0)
                adev.push(...vdev);

            if (adev.length)
                res(adev);
            else
                rej();
        });
    });
}

function _ff_dev_format_args()
{
    if (os.type() == 'Darwin')
        return [ '-f', 'avfoundation' ];
}

export class TimecodeReader extends EventEmitter {

    _didx: number;
    _cidx: number  = 0;
    _frate: number = 30;
    _srate: number = 48000;

    _ltcstreamer: cp.ChildProcess;
    _ffmpeg: cp.ChildProcess;

    _ltcreader: readline.Interface;

    _running: boolean = false;
    _running_tm: NodeJS.Timeout;

    _lasttc: string;
    _currenttc: string;

    setDevice(idx: number)
    {
        log.debug("Timecode input device index set: " + idx);
        this._didx = idx;
    }

    setChannel(ch: number)
    {
        log.debug("Timcode input channel set: " + ch);
        this._cidx = ch;
    }

    setOptions(frate: number, srate: number)
    {
        log.debug("Timecode samplerate set: " + srate);
        log.debug("Timecode framerate set: " + frate);
        this._srate = srate;
        this._frate = frate;
    }

    start()
    {
        this._launch_ltcstreamer();
        this._launch_ffmpeg();

        this._ffmpeg.stdout.pipe(this._ltcstreamer.stdin);

        this._ltcreader
            = readline.createInterface({ input : this._ltcstreamer.stdout });

        this._ltcreader.on('line', this._on_ltc_line.bind(this));

        this._running_tm = setTimeout(this._on_ltc_timeout.bind(this), 2000);

        log.info("Started listening for timecode");
    }

    stop()
    {
        if(this._ffmpeg)
            this._ffmpeg.kill("SIGKILL");
        
        if(this._ltcstreamer)
            this._ltcstreamer.kill("SIGKILL");

        clearTimeout(this._running_tm);
        
        if(this._running) 
            this.emit("stop");

        log.info("Stopped reading timecode" + (this._currenttc.length? " at " + this._currenttc : ""));
    }

    _on_ltc_line(line: string)
    {
        this._currenttc  = line;
    }

    _on_ltc_timeout()
    {
        if (this._currenttc == this._lasttc) {
            if (this._running) {
                this.emit("stop", this._currenttc);
                log.warn('Stopped receiving timecode at ' + this._currenttc);
                this._running = false;
            }
        }
        else {
            this._lasttc = this._currenttc;
            if(!this._running){
                this._running = true;
                this.emit("start", this._currenttc);
                log.info("Started receiving timecode at " + this._currenttc);
            }
        }

        this._running_tm
            = setTimeout(this._on_ltc_timeout.bind(this), 2000);
    }

    _ff_device_arg()
    {
        return [ '-i', `:${this._didx}` ]
    }

    _ff_pan_option()
    {
        return [ '-af', `pan=mono|c0=c${this._cidx}` ];
    }

    _launch_ffmpeg()
    {
        this._ffmpeg = cp.spawn('ffmpeg', [
            '-loglevel',
            'warning',
            ..._ff_dev_format_args(),
            ...this._ff_device_arg(),
            ...this._ff_pan_option(),
            '-r:a',
            this._srate.toFixed(0),
            '-f',
            'u8',
            '-'
        ]);

        log.info('ffmpeg running');

        this._ffmpeg.stderr.on("data", data => {
            log.warn(data);
        })

        this._ffmpeg.on('close', (code) => {
            log.warn('ffmpeg exited with code ' + code);
        });
    }

    _launch_ltcstreamer()
    {
        this._ltcstreamer
            = cp.spawn('ltcstreamer',
                       [ this._frate.toFixed(0), this._srate.toFixed(0), '1' ]);

        log.info('ltcstreamer running');

        this._ltcstreamer.on('close', (code) => {
            log.warn('ltcstreamer exited with code ' + code);
        })
    }
}

export class Timecode {

    _remote: Requester;

    constructor(connection: Connection)
    {
        this._remote = connection.getRequester("tc");

        this._remote.connection.on("connection", () => {
            this._remote.request("rtp-available").then(msg => {
                console.log(msg);
            }).catch(err => {
                console.log(err);
            });

            this._remote.request("from-sdp", {
                sdp: `v=0
                o=- 49635646640 49635646640 IN IP4 192.168.0.103
                s=SSL-NetIO-MADI-MM-414 : 32
                i=2 channels: 01, 02
                c=IN IP4 239.10.69.176/32
                t=0 0
                a=keywds:Dante
                m=audio 5004 RTP/AVP 97
                c=IN IP4 239.10.69.176/32
                a=recvonly
                a=rtpmap:97 L24/48000/2
                a=ptime:1
                a=ts-refclk:ptp=IEEE1588-2008:00-1D-C1-FF-FE-12-2D-4C:0
                a=mediaclk:direct=641649978
                `,
                framerate: 25,
                samplerate: 48000,
                channel: 0
            }).catch(err => {
                console.log(err);
            });

            setInterval(() => {
                this._remote.request("time").then(msg => {
                    console.log(msg);
                });
            }, 5000);


            setInterval(() => {
                this._remote.request("from-sdp", {
                    sdp: `v=0
                        o=- 49635646640 49635646640 IN IP4 192.168.0.103
                        s=SSL-NetIO-MADI-MM-414 : 32
                        i=2 channels: 01, 02
                        c=IN IP4 239.10.69.176/32
                        t=0 0
                        a=keywds:Dante
                        m=audio 5004 RTP/AVP 97
                        c=IN IP4 239.10.69.176/32
                        a=recvonly
                        a=rtpmap:97 L24/48000/2
                        a=ptime:1
                        a=ts-refclk:ptp=IEEE1588-2008:00-1D-C1-FF-FE-12-2D-4C:0
                        a=mediaclk:direct=641649978
                        `,
                    framerate: 25,
                    samplerate: 48000,
                    channel: 0
                }).catch(err => {
                    log.error(err);
                })
            }, 40000);
        });
    }
};