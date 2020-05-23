"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
const events_1 = __importDefault(require("events"));
const Logger = __importStar(require("./log"));
const log = Logger.get('DEV');
class AudioDeviceConfiguration {
    constructor() {
        this.samplerate = 48000;
        this.buffersize = 1024;
        this.input_device = '';
        this.output_device = '';
        this.in = 32;
        this.out = 32;
    }
}
exports.AudioDeviceConfiguration = AudioDeviceConfiguration;
class Manager {
    constructor(con) {
        this.input_devices = [];
        this.output_devices = [];
        this.ich_names = [];
        this.och_names = [];
        this.config = new AudioDeviceConfiguration();
        this.channel_list_fresh = false;
        this.remote = con.getRequester('devmgmt');
        this.dsp = con.getRequester('dsp');
        let self = this;
    }
    refresh() {
        return __awaiter(this, void 0, void 0, function* () {
            let devices = yield this.remote.request('device-list');
            this.input_devices = devices.data.inputs;
            this.output_devices = devices.data.outputs;
            let input_device = yield this.remote.request('input-device');
            let output_device = yield this.remote.request('output-device');
            if (input_device.data && input_device.data.length)
                this.config.input_device = input_device.data;
            if (output_device.data && output_device.data.length)
                this.config.output_device = output_device.data;
            if (this.config.input_device.length
                && this.config.output_device.length) {
                let channels = yield this.remote.request('device-channels');
                console.log(channels);
            }
            let is_open = yield this.isOpen();
            let dsp_enabled = (yield this.dsp.request('is-enabled')).data;
            let srate = (yield this.remote.request('samplerate')).data;
            let bsize = (yield this.remote.request('buffersize')).data;
            this.config.buffersize = bsize;
            this.config.samplerate = srate;
            this.status = {
                nodename: 'unknown',
                id: 'unknown',
                audioInputDevice: this.config.input_device,
                audioOutputDevice: this.config.output_device,
                samplerate: this.config.samplerate,
                buffersize: this.config.buffersize,
                options: {
                    audioIns: this.input_devices,
                    audioOuts: this.output_devices,
                    buffersizes: [32, 64, 128, 256, 512, 1024],
                    samplerates: [44100, 48000]
                },
                dspUse: 0,
                latency: 0,
                device_open: is_open ? true : false,
                dsp_on: (dsp_enabled) ? true : false
            };
        });
    }
    refreshDSPLoad() {
        return __awaiter(this, void 0, void 0, function* () {
            this.status.dspUse
                = (yield this.remote.request('dsp-load')).data;
        });
    }
    setConfig() {
        return __awaiter(this, void 0, void 0, function* () {
            this.channel_list_fresh = false;
            yield this.refresh();
            yield this.remote.set('samplerate', this.config.samplerate);
            yield this.remote.set('buffersize', this.config.buffersize);
            yield this.remote.set('input-device', this.config.input_device);
            yield this.remote.set('output-device', this.config.output_device);
        });
    }
    setInputDevice(dev) {
        return __awaiter(this, void 0, void 0, function* () {
            this.channel_list_fresh = false;
            return this.remote.set('input-device', dev);
        });
    }
    setOutputDevice(dev) {
        return __awaiter(this, void 0, void 0, function* () {
            this.channel_list_fresh = false;
            return this.remote.set('output-device', dev);
        });
    }
    setSamplerate(rate) {
        return __awaiter(this, void 0, void 0, function* () {
            let was_open = yield this.isOpen();
            if (was_open)
                yield this.close();
            let ret = yield this.remote.set('samplerate', rate);
            if (was_open)
                yield this.open();
            return ret;
        });
    }
    setBuffersize(size) {
        return __awaiter(this, void 0, void 0, function* () {
            let was_open = yield this.isOpen();
            if (was_open)
                yield this.close();
            let ret = yield this.remote.set('buffersize', size);
            if (was_open)
                yield this.open();
            return ret;
        });
    }
    open() {
        return __awaiter(this, void 0, void 0, function* () {
            this.channel_list_fresh = false;
            return this.remote.set('open', true);
        });
    }
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            this.channel_list_fresh = false;
            return this.remote.set('open', false);
        });
    }
    isOpen() {
        return __awaiter(this, void 0, void 0, function* () {
            let is_open = yield this.remote.request('open');
            return is_open.data ? true : false;
        });
    }
    enable() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dsp.set('is-enabled', true);
        });
    }
    disable() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dsp.set('is-enabled', false);
        });
    }
    isEnabled() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.dsp.request('is-enabled');
        });
    }
    getChannelList() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.channel_list_fresh)
                return this.channel_list_cache;
            let channels = (yield this.remote.request('device-channels'))
                .data;
            channels.inputs = channels.inputs.map((ch, i) => {
                return {
                    name: ch, i: i
                };
            });
            channels.outputs = channels.outputs.map((ch, i) => {
                return {
                    name: ch, i: i
                };
            });
            this.channel_list_cache = channels;
            this.channel_list_fresh = true;
            return channels;
        });
    }
}
exports.Manager = Manager;
class AudioDeviceManager extends events_1.default {
    constructor(server, instances) {
        super();
        let self = this;
        this.instances = instances;
        server.on('connection', (socket) => {
            socket.on('audiosettings.update', this.handleUpdateRequest.bind(self, socket));
            socket.on('audiosettings.inputdevice.set', (node, device) => {
                log.info('New input device requested for node ' + node
                    + ': ' + device);
                self.instances.find(ins => ins.instance.name == node)
                    .instance.devices.setInputDevice(device)
                    .then(() => {
                    console.log('device set.');
                    socket.emit('audiosettings.operation.done');
                });
            });
            socket.on('audiosettings.outputdevice.set', (node, device) => {
                log.info('New output device requested for node '
                    + node + ': ' + device);
                self.instances.find(ins => ins.instance.name == node)
                    .instance.devices.setOutputDevice(device)
                    .then(() => {
                    socket.emit('audiosettings.operation.done');
                });
            });
            socket.on('audiosettings.buffersize.set', (node, buffersize) => {
                log.info('New buffersize requested for node ' + node
                    + ': ' + buffersize);
                self.instances.find(ins => ins.instance.name == node)
                    .instance.devices.setBuffersize(buffersize)
                    .then(() => {
                    socket.emit('audiosettings.operation.done');
                });
            });
            socket.on('audiosettings.samplerate.set', (node, samplerate) => {
                log.info('New samplerate requested for node ' + node
                    + ': ' + samplerate);
                self.instances.find(ins => ins.instance.name == node)
                    .instance.devices.setSamplerate(samplerate)
                    .then(() => {
                    socket.emit('audiosettings.operation.done');
                });
            });
            socket.on('audiosettings.dsp.enabled', (node, is_enabled) => {
                log.info('Setting new DSP Status for node ' + node + ':'
                    + ((is_enabled) ? 'enabled' : 'disabled'));
                const confirm = (msg) => {
                    socket.emit('audiosettings.operation.done');
                };
                const do_catch = (err) => {
                    log.error(err);
                };
                if (is_enabled)
                    self.instances.find(ins => ins.instance.name == node)
                        .instance.devices.enable()
                        .then(confirm)
                        .catch(do_catch);
                else
                    self.instances.find(ins => ins.instance.name == node)
                        .instance.devices.disable()
                        .then(confirm)
                        .catch(do_catch);
            });
            socket.on('audiosettings.device.open', (node, is_open) => {
                log.info('Setting device open status for node ' + node + ':'
                    + ((is_open) ? 'enabled' : 'disabled'));
                const confirm = (msg) => {
                    socket.emit('audiosettings.operation.done');
                };
                const do_catch = (err) => {
                    log.error(err);
                };
                if (is_open)
                    self.instances.find(ins => ins.instance.name == node)
                        .instance.devices.open()
                        .then(confirm)
                        .catch(do_catch);
                else
                    self.instances.find(ins => ins.instance.name == node)
                        .instance.devices.close()
                        .then(confirm)
                        .catch(do_catch);
            });
            socket.on('audiosettings.dspuse', () => {
                this.instances.forEach(ins => {
                    ins.instance.devices.refreshDSPLoad()
                        .then(() => {
                        socket.emit('audiosettings.dspuse', {
                            id: ins.instance.id,
                            value: ins.instance.devices.status.dspUse
                        });
                    })
                        .catch(err => log.error(err));
                });
            });
        });
    }
    handleUpdateRequest(socket) {
        log.info('Refreshing audio device data');
        this.refreshAllDevices()
            .then((data) => {
            socket.emit('audiosettings.update.done', data);
        })
            .catch(err => log.error(err));
    }
    refreshAllDevices() {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.all(this.instances.map(ins => ins.instance.devices.refresh()));
            return this.instances.map(ins => {
                console.log(ins.instance.name);
                let status = ins.instance.devices.status;
                status.nodename = ins.instance.name;
                status.id = ins.instance.id;
                return status;
            });
        });
    }
    getAllChannelLists() {
        return __awaiter(this, void 0, void 0, function* () {
            return Promise.all(this.instances.map(function (ins) {
                return __awaiter(this, void 0, void 0, function* () {
                    return {
                        id: ins.instance.id, name: ins.instance.name,
                        channels: yield ins.instance.devices.getChannelList()
                    };
                });
            }));
        });
    }
}
exports.AudioDeviceManager = AudioDeviceManager;
//# sourceMappingURL=audio_devices.js.map