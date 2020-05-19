
declare module 'osc-min' {
    namespace osc {

        interface OSCMessageArg {
            type: string;
            value?: any;
        }

        interface OSCMessageStringArg extends OSCMessageArg {
            type: "string";
            value: string;
        }

        interface OSCMessageNumericArg extends OSCMessageArg {
            type: "float" | "integer" | "timetag";
            value: number;
        }

        interface OSCMessageBlobArg extends OSCMessageArg {
            type: "blob";
            value: Buffer;
        }

        interface OSCMessageBoolArg extends OSCMessageArg {
            type: "true" | "false";
            value?: any;
        }

        interface OSCMessageNullArg extends OSCMessageArg {
            type: "null";
            value?: any;
        }

        interface OSCMessageBangArg {
            type: "bang";
            value?: any;
        }

        interface OSCMessageArrayArg {
            type: "array";
            value: OSCMessageArg[];
        }

        interface OSCMessage {
            oscType: "message";
            address: string;
            args: (OSCMessageArg | number | string)[];
        }

        interface OSCBundle {
            oscType: "bundle";
            timetag?: number;
            elements: (OSCBundle | OSCMessage)[];
        }

        function fromBuffer(buf: Buffer): OSCMessage | OSCBundle;
        function toBuffer(obj: OSCBundle | OSCMessage): Buffer;
    }

    export = osc;

}

