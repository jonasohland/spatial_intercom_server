
declare module 'osc-min' {
    
    namespace osc {
        function fromBuffer(buf: Buffer): any;
        function toBuffer(obj: any): Buffer;
    }

    export = osc;

}

