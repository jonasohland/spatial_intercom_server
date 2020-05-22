import dgram, {RemoteInfo} from 'dgram';
import * as dnssd from 'dnssd';
import SerialPort from 'serialport';

import {
    HeadtrackerConfigFlags,
    HeadtrackerConfigPacket,
    HeadtrackerDataPacket,
    HeadtrackerInvertation,
    HeadtrackerNetworkFlags,
    HeadtrackerNetworkSettings,
    HeadtrackerStateFlags,
    Quaternion
} from './headtracker';
import {} from './headtracker_network'
import {
    LocalHeadtracker,
    QuaternionContainer,
    UDPOutputAdapter
} from './headtracker_serial';
import * as Logger from './log';
import {ShowfileManager} from './showfiles'
import { EventEmitter } from 'events';

const log = Logger.get('BRIDGE');

class SIOutputAdapter extends UDPOutputAdapter {

    id: number = 0;

    process(q: QuaternionContainer): void
    {
        let { buffer, offset } = q.data();

        if (q.float())
            this.sendData(HeadtrackerDataPacket.newPacketFromFloatLEData(
                buffer, offset, this.id));
        else
            this.sendData(HeadtrackerDataPacket.newPackerFromInt16Data(
                buffer, offset, this.id));
    }
}

export class HeadtrackerBridgeDevice extends EventEmitter {

    private lhtrk: LocalHeadtracker;
    private output: SIOutputAdapter;
    path: string;
    _adv: dnssd.Advertisement;

    constructor(port: SerialPort)
    {
        super();

        this.path = port.path;
        this.output = new SIOutputAdapter();
        this.lhtrk  = new LocalHeadtracker(port, this.output);

        this.lhtrk.on('close', (err) => {
            log.warn("Headtracker closed");
            this.emit('close');
        })

        this.output.setRemote('127.0.0.1', 9999);

        this._adv = new dnssd.Advertisement(
            dnssd.udp('_htrk'), 5697, { host : 'si_htrk_01' });

        this._adv.start();
    }

    async reconnect(port: SerialPort)
    {
        await this.lhtrk.destroy();
        this.lhtrk = new LocalHeadtracker(port, this.output);
    }

    destroy() 
    {
        this.lhtrk.destroy().catch((err) => {
            log.warn("Could not close port: " + err);
        });
    }
}

export class HeadtrackerBridge {

    _devs: HeadtrackerBridgeDevice[] = [];
    _remote: RemoteInfo;

    findDeviceForPath(p: string)
    {
        return this._devs.find(d => d.path === p);
    }

    addDevice(p: string)
    {
        log.info('Opening port ' + p);
        let odev = this.findDeviceForPath(p);

        if (odev)
            return log.error(
                'Device ' + p
                + ' already opened. Not trying to open again. That would be pointless.');

        let newdev = new HeadtrackerBridgeDevice(
            new SerialPort(p, { baudRate : 115200, autoOpen : false }));

        this._devs.push(newdev);
        
        newdev.on('close', this.removeDevice.bind(this, p));
    }

    removeDevice(p: string)
    {
        let dev = this.findDeviceForPath(p);

        if(!dev)
            return;

        dev.destroy();
        
        log.info('Closing port and deregistering device at ' + p);

        this._devs.splice(this._devs.indexOf(dev), 1);
    }
}