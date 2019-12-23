import construct_bonjour from 'bonjour'
import datagram from 'dgram'

const bonjour = construct_bonjour();

const browser = bonjour.find({ type: 'tracking_stream', protocol: 'udp' }, function (service) {

    console.log(service);

    let watchdog_socket = datagram.createSocket('udp4', (msg, rinfo) => {

    });

    watchdog_socket.on('error', err => {

    });

    watchdog_socket.bind(10551);

});