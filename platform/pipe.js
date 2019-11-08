const net = require('net');
const fs = require('fs');
const logger = require('../src/log');

const log = logger.get("PIP");

function pipename(name) {
    if (process.platform == "win32")
        return `\\\\.\\pipe\\spat_icom_ipc_${name}`;
    else {

        const pname = `/tmp/spat_icom_ipc_${name}`;

        if (fs.existsSync(pname))
            fs.unlinkSync(pname);

        return pname;
    }
}

module.exports.make = function (name, callback) {
    let server = net.createServer(callback).listen(pipename(name));

    log.info("Created Pipe on " + pipename(name));

    return server;
}