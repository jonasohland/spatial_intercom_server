export interface KeyWithValue {
    key: string,
    value: any
}

export function webifResponseEvent(nodeid: string, modulename: string, event: string)
{
    return `${nodeid}.${modulename}.${event}`;
}

export function nodeRoomName(nodeid: string, module: string, topic: string)
{
    return `${nodeid}-${module}-${topic}`;
}

export function serverRoomName(module: string, topic: string) 
{
    return `${module}-${topic}`;
}