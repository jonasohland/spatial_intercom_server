"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const instance_1 = require("./instance");
const AudioDevices = __importStar(require("./audio_devices"));
const socket_io_1 = __importDefault(require("socket.io"));
const Headtracking = __importStar(require("./headtracking"));
const discovery = __importStar(require("./discovery"));
const Logger = __importStar(require("./log"));
const Inputs = __importStar(require("./inputs"));
const users_1 = require("./users");
const express_1 = __importDefault(require("express"));
const log = Logger.get('SRV');
class SpatialIntercomServer {
    constructor(config) {
        this.instances = [];
        let self = this;
        this.app = express_1.default();
        this.app.use(express_1.default.static(`${__dirname}/../../interface/dist`));
        if (config.webserver) {
            this.app.listen(8090, () => {
                log.info("Webserver running");
            });
        }
        this.advertiser = discovery.getServerAdvertiser(config.interface);
        this.webinterface_advertiser = discovery.getWebinterfaceAdvertiser(config.web_interface);
        this.server = socket_io_1.default(45045);
        this.webif_server = socket_io_1.default(45040);
        this.audio_device_manager = new AudioDevices.AudioDeviceManager(this.webif_server, this.instances);
        this.inputs = new Inputs.InputManager(this.webif_server, this.audio_device_manager);
        this.headtracking = new Headtracking.Headtracking(33032, this.webif_server, config.interface);
        this.users = new users_1.UsersManager(this.webif_server, this.inputs, this.headtracking);
        this.server.on('connection', this.newInstanceFound.bind(this));
        this.advertiser.start();
        this.webinterface_advertiser.start();
    }
    newInstanceFound(socket) {
        let self = this;
        socket.on('disconnect', (reason) => {
            self.instanceLeft(socket);
        });
        socket.on('__name', (name, id, addresses) => {
            log.info("New instanced registered with name: " + name);
            let new_instance = new instance_1.SpatialIntercomInstance(name, id, false, addresses, socket);
            self.instances.push({
                instance: new_instance,
                socket: socket,
                is_remote: true
            });
        });
        socket.emit('__name');
    }
    instanceLeft(socket) {
        let old = this.instances.splice(this.instances.indexOf(this.instances.find(ins => ins.socket == socket)), 1);
    }
}
exports.SpatialIntercomServer = SpatialIntercomServer;
//# sourceMappingURL=server.js.map