const net = require('net');
const pipe = require('./platform/pipe');

let counter = 0;
let sender = null;

const connection = pipe.make("test");

connection.on('connection', socket => {

    console.log("connected");

    sender = setInterval(() => {
        ++counter;
        socket.write(JSON.stringify({ n: "test", d: "nothing " + counter, m: 0 }) + '\0');
    }, 1);

    socket.on('close', (err) => {

        if (sender)
            clearInterval(sender);

        if (err)
            console.log("closed with error");
        else
            console.log("closed");
    })
});