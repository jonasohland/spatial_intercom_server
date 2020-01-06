import 'commander'

import commander from 'commander'
import dnssd from 'dnssd'
import * as fs from 'fs';
import * as http from 'http'
import io from 'socket.io'

import * as config from './config'
import * as DSP from './dsp';
import {Headtracking} from './headtracker'
import * as ipc from './ipc'
import * as Logger from './log'

import * as VST from './vst'
import * as AudioDevice from './audio_devices'

import { SpatializerModule, DecoderModule, BasicSpatializer, BasicBinauralDecoder, AdvancedBinauralDecoder } from './dsp-modules'

import * as Audio from './audio'
import { encode } from 'querystring';

/*
const log = Logger.get('SRV');

const program = new commander.Command();

program.version('0.0.1');
program.option('-i, --interface <interface>', 'use this network interface')
program.option('-w, --web-interface <interface>')
program.option('-h, --htrk-interface <interface>')
program.option('-p, --port <port>')
program.option('--no-webserver')
program.parse(process.argv);

let si_server_config = config.merge(program);

const si_server = http.createServer();
const server    = io(si_server);

Logger.rct.attach(server);

const ad
    = new dnssd.Advertisement(dnssd.tcp('http'), 8080, { name : 'si_server' })
          .start();

server.on('connection',
          sock => { log.info('New client connected from '
                             + sock.client.conn.remoteAddress) });

log.info('Searching for headtracking devices'
         + ((si_server_config.htrk_interface != undefined)
                ? ' on interface ' + si_server_config.htrk_interface
                : ''));

const hdtrck = new Headtracking(4009, server, si_server_config.htrk_interface);

si_server.listen(10156,
                 (si_server_config.web_interface)
                     ? si_server_config.web_interface
                     : '0.0.0.0');

                     */
let value = 0;
let value2 = 0;
let value3 = 0;
let send = false;

const con = new ipc.Connection("default");
const vst = new VST.Manager(con);
const audio_devices = new AudioDevice.Manager(con);
const dsp = new Audio.DSPHost(con);

const graph = new DSP.Graph(con);

graph.setInputNode(64);
graph.setOutputNode(64);

const spatializer = new BasicSpatializer("test_spatializer_1");
const decoder = new AdvancedBinauralDecoder("test_decoder_1");

graph.addNode(spatializer);
graph.addNode(decoder);

graph.addConnection(graph.mainInBus().connectIdxN(spatializer.mainIn(), 4, spatializer.mainIn().channelCount()));
graph.addConnection(spatializer.mainOut().connect(decoder.mainIn()))
graph.addConnection(decoder.mainOut().connectIdxNIdx(graph.mainOutBus(), 0, 1, 2));

con.on('connection', () => {
    audioDeviceTest();
})

con.begin();

async function audioDeviceTest(){

    await audio_devices.refresh();

    audio_devices.config.input_device = audio_devices.input_devices[audio_devices.input_devices.length - 1];
    audio_devices.config.output_device = audio_devices.output_devices[audio_devices.output_devices.length - 1];

    await audio_devices.setConfig();

    await audio_devices.openDevices();

    await vst.refreshPluginList();

    await graph.sync();

    send = true;
    
    await dsp.enable();
}

setInterval(() => {

    value += 1;

    if(value == 180)
        value = -180;

    if(send)
        spatializer.setAzimuthDeg(value);
        
}, 50);

setInterval(() => {

    value2 += 1;

    if(value2 == 360)
        value2 = -360;

    if(send)
        spatializer.setStereoWidthDegs(value2);
        
}, 30);


setInterval(() => {

    value3 += 1;

    if(value3 == 180)
        value3 = -180;

    if(send)
        spatializer.setElevationDeg(value3);
        
}, 10);
