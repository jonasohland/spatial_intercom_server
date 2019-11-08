import * as IPC from './ipc';
import Net from 'net';

const con = new IPC.Connection("test");

con.on('connection', (s: Net.Socket) => {

    con.request("devmgmt", "device_list")
    .then(msg => {
        return con.request("app", "ctrl", "stop");
    })
    .then((msg) => {
    })
    .catch(err => console.log(err))

});

con.begin();