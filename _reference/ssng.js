module.exports.funcIndex = function () {
  console.log('ssng.js:funcIndex')
  const dgram = require('dgram');
  const EL_port = 3610;
  const EL_mcAddress = '224.0.23.0';

  const server = dgram.createSocket('udp4');
  server.on('error', (err) => {
    console.log(`server error:\n${err.stack}`);
    server.close();
  });

  server.on('listening', () => {
    const address = server.address();
    console.log(`server listening ${address.address}:${address.port}`);
  });

  // receive udp data
  server.on('message', (msg, rinfo) => {
    console.log(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
    let uint8Array =[];
    for (let i = 0; i < msg.length; i++) {
        uint8Array.push(toStringHex(msg.readUInt8(i), 1));
    }
    console.log(`Received UDP: ${uint8Array} from ${rinfo.address}:${rinfo.port}`);
  });

  // bind port and set for multicast, then start listening
  server.bind( EL_port, function() {
    // server.addMembership( EL_mcAddress , SRC_ADR_1);
    server.addMembership( EL_mcAddress);
    console.log( "port bind OK!" );
  });

  function toStringHex(number, bytes) {
    let str = number.toString(16).toUpperCase();
    while (str.length < 2*bytes) { str = "0" + str; }
    return str;
  }
}