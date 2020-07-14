import { Room } from "./rooms";

export interface RoomData {
    letter: string
    enabled: boolean;
    reflections: number;
    room: {
        size: number;
        depth: number,
        height: number,
        width: number
    }
    attn: {
        front: number;
        back: number;
        left: number;
        right: number;
        ceiling: number;
        floor: number;
    }
    eq: {
        high: {
            freq: number;
            gain: number;
        }
        low: {
            freq: number;
            gain: number;
        }
    }
}

export function defaultRoom(letter: string): RoomData {
    return {
        letter: letter,
        enabled: false,
        reflections: 0.,
        room: {
            size: 10,
            depth: 0.5,
            height: 0.5,
            width: 0.5,
        },
        attn: {
            front: 0.,
            back: 0.,
            left: 0.,
            right: 0.,
            ceiling: 0.,
            floor: 0.
        },
        eq: {
            high: {
                freq: 8000.,
                gain: 0.,
            },
            low: {
                freq:  100,
                gain: 0.,
            }
        }
    }   
}