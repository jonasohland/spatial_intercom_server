import { ServerModule } from "./core";
import { Application, Router } from "express";
import * as Logger from './log';
import { DSPNode } from "./dsp_node";
import { NODE_TYPE } from "./communication";

const log = Logger.get('RESTSV');


export class RestService extends ServerModule {
    
    constructor()
    {
        super('rest');
    }

    registerRoutes(app: Application)
    {
        let nodeRouter = Router();

        nodeRouter.get('/:id/name', (req, res) => {
            let node = this.getNode(req.params.id);
            if(node) {
                res.send(node.name());
            }
            else {
                res.status(400);
                res.send("Node not found");
                return;
            }
        });

        nodeRouter.get('/:id/graph', (req, res) => {
            let node = <DSPNode> this.getNode(req.params.id);
            if(node) {
                res.send(node.dsp_process._graph.visualize());
            }
            else {
                res.status(400);
                res.send("Node not found");
                return;
            }
        });

        app.get('/nodes', (req, res) => {
            res.send(this.server.nodes(NODE_TYPE.DSP_NODE).map(node => { return { id: node.id(), name: node.name() }}));
        })

        app.use('/node', nodeRouter);
    }

    init() {

    }

    joined(socket: SocketIO.Socket) 
    {

    }

    left(socket: SocketIO.Socket)
    {

    }
}