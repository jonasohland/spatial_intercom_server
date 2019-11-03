const net = require('net');
const fs = require('fs');

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
    return server = net.createServer(callback).listen(pipename(name));
}