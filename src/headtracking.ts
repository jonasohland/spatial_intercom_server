import {createSocket as createDgramSocket, Socket} from 'dgram';
import dnssd from 'dnssd';
import EventEmitter from 'events';
import * as Logger from './log';

import { NetworkHeadtracker } from './headtracker_network'

import { Headtracker, 
        HeadtrackerInvertation, 
        HeadtrackerConfigFlags, 
        HeadtrackerNetworkFlags, 
        HeadtrackerNetworkSettings, 
        HeadtrackerStateFlags } from './headtracker'

// import mkbonjour, { Bonjour, Browser } from 'bonjour-hap';

let comCheckInterval = 10000;

const log = Logger.get('HTK');

export class Headtracking extends EventEmitter {

    local_interface: string;

    browser: dnssd.Browser;
    trackers: Headtracker[] = [];

    server: SocketIO.Server;

    constructor(port: number, interf: SocketIO.Server, netif?: string)
    {
        super();

        this.local_interface = netif;
        this.server          = interf;

        this.browser = new dnssd.Browser(dnssd.udp('_htrk'), {
            interface : netif,
        });

        this.browser.on('serviceUp', this.serviceFound.bind(this));
        this.browser.on('serviceDown', this.serviceRemoved.bind(this));

        this.browser.start();

        let self = this;

        this.server.on('connection', socket => {
            socket.on('htrk.update.req', () => {
                self.updateRemote(socket);
            })

            socket.on('htrk.sr.changed', (id: number, sr: number) => {
                console.log('sr changed')
                self.getHeadtracker(id).setSamplerate(sr);
            })

            socket.on('htrk.stream.changed', (id: number, on: boolean) => {
                if (on)
                    self.getHeadtracker(id).enableTx();
                else
                    self.getHeadtracker(id).disableTx();
            });

            socket.on('htrk.reboot', (id: number) => {
                self.getHeadtracker(id).reboot();
            });

            socket.on('htrk.save', (id: number) => {
                self.getHeadtracker(id).save();
            });

            socket.on('htrk.invert.changed',
                      (id: number, inv: HeadtrackerInvertation) => {
                          log.info('Invertation changed on headtracker ' + id)
                          self.getHeadtracker(id).setInvertation(inv) });

                          socket.on('htrk.save.settings',
                                    (settings: HeadtrackerNetworkSettings) => {
                                        self.getHeadtracker(settings.id)
                                            .applyNetworkSettings(settings);
                                    });

                          socket.on('htrk.reset.orientation',
                                    (id: number) => self.getHeadtracker(id)
                                                        .resetOrientation());
        });
    }

    serviceFound(service: dnssd.Service)
    {
        log.info('Found new headtracking service on ' + service.addresses[0]);

        let id = Number.parseInt(service.host.substr(8, 2));

        console.log(service);

        let htrk = new NetworkHeadtracker(this.server,
                                   id,
                                   service.addresses[0],
                                   service.port,
                                   Math.floor(Math.random() * 10000) + 5000,
                                   this.local_interface);
        htrk.start();

        this.addHeadtracker(htrk, id, service.addresses[0]);
    }

    addHeadtracker(trk: Headtracker, id: number, address: string) {

        trk.on('update', this.updateRemote.bind(this));

        let dup = this.trackers.find(trk => trk.remote.id == id)

        if (dup)
        {
            dup.destroy();
            this.trackers.splice(this.trackers.indexOf(dup), 1);
        }

        this.trackers.push(trk);

        log.info("Add Headtracker at " + address);
        this.server.emit('htrk.connected', id, address);
    }

    serviceRemoved(service: dnssd.Service) {}

    getHeadtracker(id: number)
    {
        return this.trackers.filter(tr => tr.remote.conf.deviceID() == id)[0];
    }

    updateRemote(socket?: SocketIO.Socket)
    {
        // clang-format off
        let tracker_update = this.trackers
            .map((tracker: Headtracker) => {
                if (tracker.remote.conf) 
                return {
                        data: {
                            address:        tracker.remote.addr,
                            gyro_online:    tracker.remote.conf.isStateFlagSet(HeadtrackerStateFlags.GY_PRESENT),
                            gyro_ready:     tracker.remote.conf.isStateFlagSet(HeadtrackerStateFlags.GY_RDY),
                            online:         tracker.isOnline(),
                            samplerate:     tracker.remote.conf.sample_rate,
                            stream_on:      tracker.remote.conf.isDeviceFlagSet(HeadtrackerConfigFlags.STREAM_ENABLED),
                            id:             tracker.remote.conf.deviceID(),

                            settings: {
                                id: tracker.remote.conf.deviceID(),
                                addr: tracker.remote.conf.device_static_ip,
                                subnet: tracker.remote.conf.device_static_subnet,
                                dhcp: tracker.remote.conf.isNetworkFlagSet(HeadtrackerNetworkFlags.DHCP)
                            },

                            invert: {
                                x: tracker.remote.conf.isStateFlagSet(HeadtrackerStateFlags.INVERT_X),
                                y: tracker.remote.conf.isStateFlagSet(HeadtrackerStateFlags.INVERT_Y),
                                z: tracker.remote.conf.isStateFlagSet(HeadtrackerStateFlags.INVERT_Z)
                            }
                            
                        }
                    }
                else
                    return null;
            })
            .filter(v => v != null);
        // clang-format on

        console.log(tracker_update);

        if (socket)
            socket.emit('htrk.update', tracker_update);
        else
            this.server.emit('htrk.update', tracker_update);
    }
}
