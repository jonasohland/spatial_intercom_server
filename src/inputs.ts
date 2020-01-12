import * as DSP from './dsp'
import { SpatialIntercomInstance } from './instance';
import { AudioDeviceManager } from './audio_devices';

interface NodeAndInputs {
    si: SpatialIntercomInstance;
    inputs: Input[];
}

export class Input {
    id: number;
    name: string;
    format: DSP.PortTypes;
}

export class InputManager {
    
    inputs: NodeAndInputs[];
    devices: AudioDeviceManager;

    constructor(io: SocketIO.Server, audioDevMan: AudioDeviceManager) {

        let self = this;

        this.devices = audioDevMan;
        this.inputs = [];

        io.on('connection', socket => {

            console.log("new connection for input manager");
            
            socket.on('inputs.update', () => {

                console.log("Update Inputs.");

                self.updateInterface(socket).catch(err => {
                    console.log(err);
                })

            });
        
        })

    }

    async updateInterface(sock: SocketIO.Socket) {

        let nodes = await this.devices.getAllChannelLists();

        sock.emit('inputs.update', {
            nodes: nodes
        });
    }
}