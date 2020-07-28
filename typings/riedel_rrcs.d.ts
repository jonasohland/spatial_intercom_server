declare module 'riedel_rrcs' {
    namespace riedel_rrcs { 
        
        class RRCS_Client {
            constructor(host: string, port: number);
        }

        interface Endpoint {
            ip: string,
            port: number
        }

        interface RRCSServerCallbacks {
            log: (msg: string) => void;
            initial?: (msg: any, error: any) => void;
            error?: (msg: any, error: any) => void;
            getAlive: (msg: any) => void;
            crosspointChange: (params: any) => void;
            sendString: (params: any) => void;
            sendStringOff: (params: any) => void;
            gpInputChange: (params: any) => void;
            logicSourceChange: (params: any) => void;
            configurationChange: (params: any) => void;
            upstreamFailed: (params: any) => void;
            upstreamFaieldCleared: (params: any) => void;
            downstreamFailed: (params: any) => void;
            downstreamFailedCleared: (params: any) => void;
            nodeControllerFailed: (params: any) => void;
            nodeControllerReboot: (params: any) => void;
            clientFailed: (params: any) => void;
            clientFailedCleared: (params: any) => void;
            portInactive: (params: any) => void;
            portActive: (params: any) => void;
            connectArtistRestored: (params: any)=> void;
            connectArtistFailed: (params: any) => void;
            gatewayShutdown: (params: any) => void;
            notFound: (params: any) => void;
        }

        class RRCS_Server {
            constructor(local: Endpoint, remote: Endpoint, callbacks: RRCSServerCallbacks);
        }
    }

    export = riedel_rrcs;
}