"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const dnssd_1 = __importDefault(require("dnssd"));
const events_1 = __importDefault(require("events"));
const Logger = __importStar(require("./log"));
const headtracker_network_1 = require("./headtracker_network");
const headtracker_1 = require("./headtracker");
// import mkbonjour, { Bonjour, Browser } from 'bonjour-hap';
let comCheckInterval = 10000;
const log = Logger.get('HTK');
class Headtracking extends events_1.default {
    constructor(port, interf, netif) {
        super();
        this.trackers = [];
        this.local_interface = netif;
        this.server = interf;
        this.browser = new dnssd_1.default.Browser(dnssd_1.default.udp('_htrk'), {
            interface: netif,
        });
        this.browser.on('serviceUp', this.serviceFound.bind(this));
        this.browser.on('serviceDown', this.serviceRemoved.bind(this));
        this.browser.start();
        let self = this;
        this.server.on('connection', socket => {
            socket.on('htrk.update.req', () => {
                self.updateRemote(socket);
            });
            socket.on('htrk.sr.changed', (id, sr) => {
                console.log('sr changed');
                self.getHeadtracker(id).setSamplerate(sr);
            });
            socket.on('htrk.stream.changed', (id, on) => {
                if (on)
                    self.getHeadtracker(id).enableTx();
                else
                    self.getHeadtracker(id).disableTx();
            });
            socket.on('htrk.reboot', (id) => {
                self.getHeadtracker(id).reboot();
            });
            socket.on('htrk.save', (id) => {
                self.getHeadtracker(id).save();
            });
            socket.on('htrk.invert.changed', (id, inv) => {
                log.info('Invertation changed on headtracker ' + id);
                self.getHeadtracker(id).setInvertation(inv);
            });
            socket.on('htrk.save.settings', (settings) => {
                self.getHeadtracker(settings.id)
                    .applyNetworkSettings(settings);
            });
            socket.on('htrk.reset.orientation', (id) => self.getHeadtracker(id)
                .resetOrientation());
        });
    }
    serviceFound(service) {
        log.info('Found new headtracking service on ' + service.addresses[0]);
        let id = Number.parseInt(service.host.substr(8, 2));
        console.log(service);
        let htrk = new headtracker_network_1.NetworkHeadtracker(this.server, id, service.addresses[0], service.port, Math.floor(Math.random() * 10000) + 5000, this.local_interface);
        htrk.start();
        this.addHeadtracker(htrk, id, service.addresses[0]);
    }
    addHeadtracker(trk, id, address) {
        trk.on('update', this.updateRemote.bind(this));
        let dup = this.trackers.find(trk => trk.remote.id == id);
        if (dup) {
            dup.destroy();
            this.trackers.splice(this.trackers.indexOf(dup), 1);
        }
        this.trackers.push(trk);
        log.info("Add Headtracker at " + address);
        this.server.emit('htrk.connected', id, address);
    }
    serviceRemoved(service) { }
    getHeadtracker(id) {
        return this.trackers.filter(tr => tr.remote.conf.deviceID() == id)[0];
    }
    updateRemote(socket) {
        // clang-format off
        let tracker_update = this.trackers
            .map((tracker) => {
            if (tracker.remote.conf)
                return {
                    data: {
                        address: tracker.remote.addr,
                        gyro_online: tracker.remote.conf.isStateFlagSet(headtracker_1.HeadtrackerStateFlags.GY_PRESENT),
                        gyro_ready: tracker.remote.conf.isStateFlagSet(headtracker_1.HeadtrackerStateFlags.GY_RDY),
                        online: tracker.isOnline(),
                        samplerate: tracker.remote.conf.sample_rate,
                        stream_on: tracker.remote.conf.isDeviceFlagSet(headtracker_1.HeadtrackerConfigFlags.STREAM_ENABLED),
                        id: tracker.remote.conf.deviceID(),
                        settings: {
                            id: tracker.remote.conf.deviceID(),
                            addr: tracker.remote.conf.device_static_ip,
                            subnet: tracker.remote.conf.device_static_subnet,
                            dhcp: tracker.remote.conf.isNetworkFlagSet(headtracker_1.HeadtrackerNetworkFlags.DHCP)
                        },
                        invert: {
                            x: tracker.remote.conf.isStateFlagSet(headtracker_1.HeadtrackerStateFlags.INVERT_X),
                            y: tracker.remote.conf.isStateFlagSet(headtracker_1.HeadtrackerStateFlags.INVERT_Y),
                            z: tracker.remote.conf.isStateFlagSet(headtracker_1.HeadtrackerStateFlags.INVERT_Z)
                        }
                    }
                };
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
exports.Headtracking = Headtracking;
//# sourceMappingURL=headtracking.js.map