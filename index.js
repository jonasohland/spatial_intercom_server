const IPC = require('./src/ipc')

const con = new IPC.Connection("test");

con.on('connection', s => {

    let msg = new IPC.Message("devmgmt", "device_input", IPC.MessageMode.SET);

    msg.setString("ASIO MADIface USB");

    con.send(msg);
});

con.on('devmgmt', data => {

    console.log(data.d);

    con.send(new IPC.Message("app", "ctrl", IPC.MessageMode.SET).setString("stop"));
});

con.begin();