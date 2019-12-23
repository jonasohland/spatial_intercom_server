declare module OSC {}

declare namespace OSC {
    interface Message {
        (...args: any): Message;
    }
}