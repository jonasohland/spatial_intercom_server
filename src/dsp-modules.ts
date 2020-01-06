import { Module, Graph, Bus, PluginNode, AmbiBus, PortTypes, NativeNode } from './dsp'

import * as VST from './vst'
import * as IPC from './ipc'

function normalizeRads(value: number)
{
    if(value < 0)
        value += 4 * Math.PI;

    return (value + 2 * Math.PI)  / 4 * Math.PI;
}

function normalizeDegs(value: number)
{
    return (value + 180) / 360;
}

function normalizeIEMStWidthDegs(value: number)
{
    return (value + 360) / (360 * 2);
}


export class BasicSpatializer extends NativeNode {

    constructor(name: string)
    {
        super(name, 'basic_spatializer');
        this.addInputBus(Bus.createMainStereo(1));
        this.addOutputBus(AmbiBus.createMainForOrder(3, 1));
    }

    remoteAttached(): void {
        console.log("Remote attached!");
    }

    async setAzimuthDeg(value: number)
    {
        this.remote.set('azimuth', normalizeDegs(value));
    }

    async setElevationDeg(value: number)
    {
        this.remote.set('elevation', normalizeDegs(value));
    }

    async setElevation(rad: number)
    {
        return this.remote.set('elevation', normalizeRads(rad));
    }

    async setAzimuth(rad: number)
    {
        return this.remote.set('azimuth', normalizeRads(rad));
    }

    async setStereoWidthDegs(value: number)
    {
        return this.remote.set('stereo-width', normalizeIEMStWidthDegs(value));
    }
}

export class BasicBinauralDecoder extends NativeNode {

    constructor(name: string)
    {
        super(name, 'basic_binaural_decoder');
        this.addInputBus(AmbiBus.createMainForOrder(3, 1));
        this.addOutputBus(Bus.createMainStereo(1));
    }

    remoteAttached() 
    {
    }

}

export class AdvancedBinauralDecoder extends NativeNode {
    
    constructor(name: string)
    {
        super(name, 'advanced_binaural_decoder');
        this.addInputBus(AmbiBus.createMainForOrder(3, 1));
        this.addOutputBus(Bus.createMainStereo(1));
    }
    
    remoteAttached()
    {
    }

}

export class SpatializerModule extends Module {

    constructor(con: IPC.Connection)
    {
        super()
    }

    encode_nid: number = -1;
    id: number         = -1;

    input(graph: Graph): Bus
    {
        return graph.getNode(this.encode_nid).mainIn();
    }

    output(graph: Graph): Bus
    {
        return graph.getNode(this.encode_nid).mainOut();
    }

    graphChanged(graph: Graph): void 
    {

    }

    build(graph: Graph): void
    {

    }
}

export class DecoderModule extends Module {

    constructor(vst: VST.Manager)
    {
        super();
        this.vst_manager = vst;
    }

    decoder_nid: number = -1;
    vst_manager: VST.Manager;
    connections: IPC.Connection;

    input(graph: Graph): Bus {
       return graph.getNode(this.decoder_nid).mainIn();
    }    

    output(graph: Graph): Bus {
        return graph.getNode(this.decoder_nid).mainOut();
    }

    graphChanged(graph: Graph): void {
        
    }

    build(graph: Graph): void {

        let pl_id = this.vst_manager.findPlugin("BinauralDecoder").platform_id;

        let decoder_node = new PluginNode("binaural_decoder");

        decoder_node.plugin_identifier = pl_id;

        decoder_node.addInputBus(Bus.createMain(1, PortTypes.Ambi_O3));
        decoder_node.addOutputBus(Bus.createMain(1, PortTypes.Stereo));

        this.decoder_nid = graph.addNode(decoder_node);
    }
}