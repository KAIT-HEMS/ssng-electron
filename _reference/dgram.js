// renderer.js for dgram
// 2021.03.29
// 
// Receive UDP EL packets and display them on the console
// Send UDP packets (text and binary (EL) data) at launch
// receive and send with multicast address
// 
// Copyright (C) Hiroyuki FUJITA 2021.03.12
// 
// Configuration:
// +---------------+     +-----------------+
// |   192.168.1.4 |<--->|192.168.1.10     |
// +---------------+     +-----------------+
//   Destination 1           Source1
//      SSNG             this program on iMac

console.log('start renderer!');

// レンダラープロセス（ウェブページ）
const dgram = require('dgram')

const EL_port = 3610;
const EL_multiAdr4 = '224.0.23.0';

const SRC_ADR_1 = '192.168.1.10';
const DST_ADR_1 = '192.168.1.4';

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
	server.addMembership( EL_multiAdr4 , SRC_ADR_1);
	console.log( "port bind OK!" );
});

// send udp packet (text message)
const message = Buffer.from('Hello UDP');
const client = dgram.createSocket('udp4');
client.send(message, 3610, 'localhost', (err) => {
  client.close();
});

// send udp packet (binary data, ECHONET Lite INF, EPC=0xD5)
const instanceList1 = [0x10,0x81,0x00,0x0a,0x0e,0xf0,0x01,0x0e,0xf0,0x01,0x73,0x01,0xd5,0x04,0x01,0x05,0xff,0x01];
const instanceList2 = [0x10,0x81,0x00,0x0a,0x0e,0xf0,0x01,0x0e,0xf0,0x01,0x73,0x01,0xd5,0x04,0x01,0x01,0x30,0x01];
const instanceList3 = [0x10,0x81,0x00,0x0a,0x0e,0xf0,0x01,0x0e,0xf0,0x01,0x73,0x01,0xd5,0x04,0x01,0x02,0x90,0x01];
sendUdpMc(EL_multiAdr4, instanceList1, SRC_ADR_1);
sendUdp(DST_ADR_1, instanceList2);

// send unicast
function sendUdp(ip, byteArray) {   // string:ip, array:byteArray
  const buffer = new Buffer.from(byteArray);
	const client = dgram.createSocket('udp4');
	client.send( buffer, 0, buffer.length, EL_port, ip, function(err, bytes) {
		client.close();
	});
}

// send multicast
function sendUdpMc(ip, byteArray, src) {   // string:ip, array:byteArray
  const buffer = new Buffer.from(byteArray);
  const client = dgram.createSocket('udp4');
  client.bind(0, () => {
    client.setMulticastInterface(src);
  });
	client.send( buffer, 0, buffer.length, EL_port, ip, function(err, bytes) {
		client.close();
	});
}

// ------------------------------------------------------
// toStringHex()
// 数値(number)を16進数表記の文字列に変換する
// 1st argument：変換する数値
// 2nd argument：byte数
// return value: 16進数表記の文字列
// example: toStringHex(10, 1) => "0A"
// example: toStringHex(10, 2) => "000A"
function toStringHex(number, bytes) {
  let str = number.toString(16).toUpperCase();
  while (str.length < 2*bytes) { str = "0" + str; }
  return str;
}