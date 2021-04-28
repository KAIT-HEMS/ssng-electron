// renderer.js for SSNG-electron
// 2021.04.26

// UDPで受信したデータは、dataLogArray に格納される。
// packetId が 0 から順に付加される。

const VERSION = "1.0.1 2021.04.26";
const EL_port = 3610;
const EL_mcAddress = "224.0.23.0";
const logDirName = '/ssng-log';

let tid = 0;                // tid:uint8, ECHONET Lite の TID
let packetId = 0;           // 送受信パケットのid
let active_packet_id = "";  // Packet monitor 上で選択された packet の id
let dataLogArray = [];      // 送受信したパケットを配列として格納
let analyzedData = "";      // 受信データの解析結果

console.log("SSNG" + VERSION);

// レンダラープロセス（ウェブページ）
const { dgram, os, fs, Buffer } = window.native;

const epcNode = {
  0x80: [0x30],
  0x82: [0x01, 0x0c, 0x01, 0x00],
  0x83: epc83(),
  0x8a: [0x00, 0x00, 0x77],
  0x9d: [0x02, 0x80, 0xd5],
  0x9e: [0x00],
  0x9f: [
    0x0c,
    0x80,
    0x82,
    0x83,
    0x8a,
    0x9d,
    0x9e,
    0x9f,
    0xd3,
    0xd4,
    0xd5,
    0xd6,
    0xd7,
  ],
  0xd3: [0x01],
  0xd4: [0x02],
  0xd5: [0x01, 0x05, 0xff, 0x01],
  0xd6: [0x01, 0x05, 0xff, 0x01],
  0xd7: [0x01, 0x05, 0xff],
};

// EPC:0x83 識別番号 を乱数を使ってユニークな値にする。Total 17bytes。
// Data format: 0xFE + maker code(3byte) + 13 bytes unique data
// FE, 00, 00, 77, 00,00,00,00,00,00,00,00,00, XX,XX,XX,XX
// 0x00000000...0xFFFFFFFF: 0...4294967295 で乱数を発生
function epc83() {
  const hexNumber = toHex(getRandomInt(0, 4294967296));   // hexNumber:string HEXで4byteの乱数
  let edt = [0xfe,0x00,0x00,0x77,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00];
  // 4byteの乱数を追加。冒頭の '0x'を飛ばす。
  for (let i = 0; i < 4; i++) {
    edt.push(parseInt((hexNumber.substr(i*2, 2)), 16));
  }
  return edt;
  
  // min以上 max未満の整数値の乱数を発生する関数
  function getRandomInt(min, max) { // min:int, max:int return:int
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); //The maximum is exclusive and the minimum is inclusive
  }
  
  // 入力INTデータを4byteのHEX表記の大文字の文字列に変換する関数。
  function toHex(v) { // v:int, return:string
    return (('00000000' + v.toString(16).toUpperCase()).substr(-8));
  }
}

const epcDevice = {
  0x80: [0x30],
  0x81: [0x08],
  0x82: [0x00, 0x00, 0x49, 0x00],
  0x88: [0x42],
  0x8a: [0x00, 0x00, 0x77],
  0x9d: [0x03, 0x80, 0x81, 0x88],
  0x9e: [0x00],
  0x9f: [0x08, 0x80, 0x81, 0x82, 0x88, 0x8a, 0x9d, 0x9e, 0x9f],
};

const instanceList = [
  0x10,
  0x81,
  0x00,
  0x0a,
  0x0e,
  0xf0,
  0x01,
  0x0e,
  0xf0,
  0x01,
  0x73,
  0x01,
  0xd5,
  0x04,
  0x01,
  0x05,
  0xff,
  0x01,
];

// create a log folder
fs.readdir(os.homedir(), function (err, files) {
  if (err) throw err;
  if (files.includes("ssng-log") == false) {
    fs.mkdir(os.homedir() + logDirName, (err) => {
      if (err) console.log("Error: mkdir");
    });
  }
});

// create UDP socket
const server = dgram.createSocket("udp4");
server.on("error", (err) => {
  console.log(`server error:\n${err.stack}`);
  server.close();
});

// start listening
server.on("listening", () => {
  const address = server.address();
  console.log(`server listening ${address.address}:${address.port}`);
});

// receive UDP data
server.on("message", (msg, rinfo) => {
  let uint8Array = [];
  for (let i = 0; i < msg.length; i++) {
    uint8Array.push(msg.readUInt8(i));
  }
  console.log(
    `UDP Receive: from ${rinfo.address}:${rinfo.port} data: ${uint8Array}`
  );

  // GETを受信した場合の処理(GET_RES を返す)
  elGet(rinfo.address, uint8Array);

  // 送受信したパケットを配列に保存
  // const packet_id = 'packet-' + packetId++;
  const pkt = {
      id:'packet-' + packetId++,  // id:string, packet id
      timeStamp:timeStamp(),      // timeStamp: string
      direction:"R",              // direction: string, enum['R', 'T'] R:receive, T:transmit
      ip:rinfo.address,           // ip:string
      data:uint8Array             // data:uint8[]
  }
  dataLogArray.push(pkt);

  // パケットモニタの表示処理
  displayLog();
});

// bind port and set for multicast
// 複数の network if にも対応。addMembership 第２引数に network if の ip address を指定
server.bind(EL_port, function () {
  for (dev of getLocalAddress().ipv4) {
    server.addMembership(EL_mcAddress, dev.address);
  }
  // addMembership の第２引数を指定しない場合は、OSが適当な network if を利用する
  // server.addMembership(EL_mcAddress);
  console.log("port bind OK!");
});

// 起動時にインスタンスリストをマルチキャスト送信する
sendUdp(EL_mcAddress, instanceList);

// VUE
var vm = new Vue({
  el: "#app",
  data: {
    myIps: [],
    ipData: "224.0.23.0",
    el: {
      deojData: "0x013001",
      esvData: "0x62",
      epcData: "0x80",
      edtData: "0x30",
    },
    freeData: "10,81,00,0A,05,FF,01,01,30,01,62,01,80,00",
    ipDataStyle: { color: "black" },
    deojDataStyle: { color: "black" },
    esvDataStyle: { color: "black" },
    epcDataStyle: { color: "black" },
    edtDataStyle: { color: "black" },
    freeDataStyle: { color: "black" },
    rbInputData: "el",
    rbOrder: "normalOrder",
    filters: ["showGet", "showInf", "showGetres", "showSNA"],
    packet_list: [],
    packetDetail: "",
  },
  methods: {
    buttonClickSearch: function () {
      buttonClickSearch();
    },
    buttonClickSend: function () {
      buttonClickSend(this.ipData, this.el, this.freeData);
    },
    updateRbOrder: function () {
      displayLog();
    },
    updateFilters: function () {
      displayLog();
    },
    clearLog: function () {
      clearLog();
    },
    saveLog: function () {
      saveLog();
    },
    // パケット一覧からパケット行がクリックされたときの処理 (パケット詳細を表示)
    showPacketDetail: this.packetMonitorShowPacketDetail.bind(this),
    // パケット一覧で矢印キーが押されたときの処理
    upDownList: this.packetMonitorUpDownList.bind(this),
  },
});

// Show My IP addresses
for (let adr of getLocalAddress().ipv4){
  vm.myIps.push(adr.address);
  console.log(adr.name, adr.address);
}

///////////////////////////////////////////////////////////////////////////////
// funtions                                                                  //
///////////////////////////////////////////////////////////////////////////////

// UDP 送信 (unicast and multicast)
// ip:string, byteArray:uint8[]
function sendUdp(ip, byteArray) {
  // unicast
  if (ip !== EL_mcAddress) {
    const buffer = new Buffer.from(byteArray);
    const client = dgram.createSocket("udp4");
    client.send(buffer, 0, buffer.length, EL_port, ip, function (err, bytes) {
      client.close();
    });
  // multicast
  } else {
    for (dev of getLocalAddress().ipv4) {
      sendUdpMc(ip, byteArray, dev.address);
    }
  }
}

// インタフェースを指定して UDP multicast 送信を実行する
// ip:string, byteArray:uint8[], src:string
function sendUdpMc(ip, byteArray, src) {
  const buffer = new Buffer.from(byteArray);
  const client = dgram.createSocket("udp4");
  client.bind(0, () => {
    client.setMulticastInterface(src);
  });
  client.send(buffer, 0, buffer.length, EL_port, ip, function (err, bytes) {
    client.close();
  });
}

// GETを受信した場合の処理
// ip:string, uint8Array:uint8[]
function elGet(ip, uint8Array) {
  const elPacket = parseEL(uint8Array);
  if (elPacket !== null) {
    const deoj = elPacket.deoj[0] *256 + elPacket.deoj[1];
    if (deoj == 0x05FF && elPacket.esv == 0x62) { // 機器オブジェクト（コントローラ）宛
      const uint8ArraySend = createUint8ArraySend(elPacket, epcDevice);
      sendUdp(ip, uint8ArraySend);
    } else if (deoj == 0x0EF0 && elPacket.esv == 0x62) { // Node profile 宛
      const uint8ArraySend = createUint8ArraySend(elPacket, epcNode);
      sendUdp(ip, uint8ArraySend);
    }
  }
}

// ECHONET Lite 送信用パケットの作成
// elPacket:object, epcs:object, return:uint8[]
function createUint8ArraySend(elPacket, epcs) {
  // 送信データの template。EHD, OPC は固定値。
  let uint8ArraySend = [
    0x10,
    0x81,
    0x00,
    0x00,
    0x0e,
    0xf0,
    0x01,
    0x0e,
    0xf0,
    0x01,
    0x72,
    0x01,
    0x80,
    0x00,
  ];
  uint8ArraySend[2] = elPacket.tid[0]; // TID
  uint8ArraySend[3] = elPacket.tid[1]; // TID
  uint8ArraySend[4] = elPacket.deoj[0]; // SEOJ
  uint8ArraySend[5] = elPacket.deoj[1]; // SEOJ
  uint8ArraySend[6] = elPacket.deoj[2]; // SEOJ
  uint8ArraySend[7] = elPacket.seoj[0]; // DEOJ
  uint8ArraySend[8] = elPacket.seoj[1]; // DEOJ
  uint8ArraySend[9] = elPacket.seoj[2]; // DEOJ
  uint8ArraySend[12] = elPacket.epc; // EPC
  const edt = epcs[elPacket.epc];
  if (edt !== undefined) {
    uint8ArraySend[10] = 0x72; // esv: Get_Res
    uint8ArraySend[13] = edt.length; // PDC
    for (let data of edt) {
      uint8ArraySend.push(data);
    }
  } else {
    uint8ArraySend[10] = 0x52; // esv: Get_SNA
  }
  return uint8ArraySend;
}

// 受信データのパース
// uint8Array:uint8[], return:obj
function parseEL(uint8Array) {
  let elr = {};
  if (uint8Array.length < 14) {
    console.log("parseEL ERROR: UDP data is less than 14 bytes.");
    return null;
  }
  const ehd = uint8Array[0] * 256 + uint8Array[1];
  if (ehd != 0x1081) {
    console.log("parseEL ERROR: EHD is wrong", uint8Array[0], uint8Array[1], ehd);
    return null;
  }
  elr.ehd = [uint8Array[0], uint8Array[1]];
  elr.tid = [uint8Array[2], uint8Array[3]];
  elr.seoj = [uint8Array[4], uint8Array[5], uint8Array[6]];
  elr.deoj = [uint8Array[7], uint8Array[8], uint8Array[9]];
  elr.esv = uint8Array[10];
  elr.opc = uint8Array[11];
  elr.operations = uint8Array.slice(12);
  if (elr.opc == 1) {
    elr.epc = uint8Array[12];
    elr.pdc = uint8Array[13];
    if (elr.pdc !== 0) {
      elr.edt = uint8Array.slice(14); // modified on 2021.03.10
    }
  }
  return elr;
}

// Get a list of Local IP Address with 'os' module 
// return: object
// {
//   ipv4:[{name:string, address:string}],
//   ipv6:[{name:string, address:string}]
// }
function getLocalAddress() {
  let ifacesObj = {};
  ifacesObj.ipv4 = [];
  ifacesObj.ipv6 = [];
  let interfaces = os.networkInterfaces();
  for (let dev in interfaces) {
    interfaces[dev].forEach(function (details) {
      if (!details.internal) {
        switch (details.family) {
          case "IPv4":
            ifacesObj.ipv4.push({ name: dev, address: details.address });
            break;
          case "IPv6":
            ifacesObj.ipv6.push({ name: dev, address: details.address });
            break;
        }
      }
    });
  }
  return ifacesObj;
}

// パケットモニターの表示内容を作成する
// 送信データは表示する
// 受信データのうち、vm.filters に名前があるものは表示する
// array:vm.filters enum:showLoopBack, showGet, showInf, showGetres, showSNA
function displayLog() {
  let log = [];
  id = 0;
  for (let dataLog of dataLogArray) {
    const esv = dataLog.data[10];
    const pkt = {
      // id: dataLog.id,
      id: id,
      timeStamp: dataLog.timeStamp,
      direction: dataLog.direction,
      address: dataLog.ip,
      hex: elFormat(dataLog.data),
      data: dataLog.data
    };
    // 能動的に送信したパケットは表示する
    if (dataLog.direction == "T") {
      log.push(pkt);
      id++;
      continue;
    }
    // Loopback がチェックされている場合 esv で判断
    if (vm.filters.includes("showLoopBack")) {
      if (filterEsv(esv)) {
        log.push(pkt);
        id++;
      }
    // Loopback がチェックされていない場合　ip と esv で判断
    } else {
      if (filterEsv(esv) && filterLoopBack(dataLog.ip)) {
        log.push(pkt);
        id++;
      }
    }
  }
  // ラジオボタン Order の処理
  if (vm.rbOrder == "reverseOrder") {
    log.reverse();
  }
  vm.packet_list = log;
  // clear packet selection
  if (this.active_packet_id) {
    $("#" + this.active_packet_id).removeClass("active");
    this.active_packet_id = "";
  }
  vm.packetDetail = "";
  return;

  // ip が loop back address ならば false 
  // ip が loop back address でなければ true
  // Loop back address は array:vm.mpIps
  function filterLoopBack(ip) { // ip:string, return: boolean
    let flag = true;
    for (let myIp of vm.myIps) {
      if (ip == myIp) {
        flag = false;
      }
    }
    return flag;
  }

  // vm.filters に showGet, showInf, showGetres, showSNA のどれかがあり
  // esv がそれぞれに対応するものがあれば true
  function filterEsv(esv) { // esv:string, return:boolean
    if (vm.filters.includes("showGet") && esv == 0x62) {
      return true;
    }
    if (vm.filters.includes("showInf") && esv == 0x73) {
      return true;
    }
    if (vm.filters.includes("showGetres") && esv == 0x72) {
      return true;
    }
    if (
      vm.filters.includes("showSNA") &&
      (esv == 0x50 || esv == 0x51 || esv == 0x52 || esv == 0x53 || esv == 0x5E)
    ) {
      return true;
    }
    return false;
  }
}

// 現在時刻（MM:HH:SS）を取得する
function timeStamp() { // return:string
  const date = new Date();
  let hour = date.getHours().toString();
  let minute = date.getMinutes().toString();
  let second = date.getSeconds().toString();
  // 桁合わせで 0 を追加
  hour = hour.length == 1 ? "0" + hour : hour;
  minute = minute.length == 1 ? "0" + minute : minute;
  second = second.length == 1 ? "0" + second : second;
  return hour + ":" + minute + ":" + second;
}

function analyzeData(uint8Array) { // uint8Array: [UInt8]
  let analyzedData = "";
  let epcArray = [];
  const esv = uint8Array[10];
  const epc = uint8Array[12];
  const edt = uint8Array.slice(14);

  // Decode PropertyMap
  if (shouldDecodePropertyMap()) {
    if (edt.length < 17) {
      // PropertyMapがEPCの列挙の場合
      for (let i = 1; i < edt.length; i++) {
        epcArray.push(toStringHex(edt[i], 1));
      }
    } else {
      // PropertyMapがbitmapの場合
      for (let i = 1; i < 17; i++) {
        for (let j = 0; j < 8; j++) {
          if ((edt[i] & (1 << j)) !== 0) {
            let epc = 0x80 + 0x10 * j + i - 1;
            epcArray.push(toStringHex(epc, 1));
          }
        }
      }
    }
    epcArray.sort();
    analyzedData = "EPC:";
    for (let data of epcArray) {
      analyzedData += " " + data;
    }
  } else {
    return null;
  }
  return analyzedData; // analyzedData: string
  function shouldDecodePropertyMap() {
    return esv == 0x72 && (epc == 0x9d || epc == 0x9e || epc == 0x9f);
  }
}

// EL data を 表示用とログ用に整形する
function elFormat(uint8Array) {
  let elString = "";
  for (let value of uint8Array) {
    elString += toStringHex(value, 1);
  }
  elString = strIns(elString, 4, " ");
  elString = strIns(elString, 9, " ");
  elString = strIns(elString, 16, " ");
  elString = strIns(elString, 23, " ");
  elString = strIns(elString, 26, " ");
  elString = strIns(elString, 29, " ");
  elString = strIns(elString, 32, " ");
  elString = strIns(elString, 35, " ");
  return elString;
}

// toStringHex()
// 数値(number)を16進数表記の文字列に変換する
// 1st argument：変換する数値
// 2nd argument：byte数
// return value: 16進数表記の文字列
// example: toStringHex(10, 1) => "0A"
// example: toStringHex(10, 2) => "000A"
function toStringHex(number, bytes) {
  let str = number.toString(16).toUpperCase();
  while (str.length < 2 * bytes) {
    str = "0" + str;
  }
  return str;
}

// stringに文字列を挿入
function strIns(str, idx, val) {
  // str:string（元の文字列）, idx:number（挿入する位置）, val:string（挿入する文字列）
  var res = str.slice(0, idx) + val + str.slice(idx);
  return res;
}

// Check input value of text field
// argument: inputType:string, enum("ip", "deoj", "esv", "epc", "edt", "free")
// get text data from text input field of "inputType"
// return value: boolean
function checkInputValue(inputType, inputValue) {
  let regex;
  switch (inputType) {
    case "ip":
      regex = /^(([1-9]?[0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([1-9]?[0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/;
      break;
    case "deoj":
      regex = /^(0x)?(\d|[a-f]|[A-F]){6}$/;
      break;
    case "esv":
    case "epc":
      regex = /^(0x)?(\d|[a-f]|[A-F]){2}$/;
      break;
    case "edt":
      regex = /^((0x)?((\d|[a-f]|[A-F]){2}){1,})?$/;
      break;
    case "free":
      regex = /^((\d|[a-f]|[A-F]){2},\s*){1,}(\d|[a-f]|[A-F]){2}\s*$/;
      break;
    default:
  }
  if (regex.test(inputValue)) {
    return true;
  } else {
    return false;
  }
}

// UI で SEND ボタンがクリックされた時に EL data を送信する
// ipData: string, el: object, freeData: object
// UI の ラジオボタンにしたがって、el または freeData を使う
function buttonClickSend(ipData, el, freeData) {
  // データチェック: ip
  if (!checkInputValue("ip", vm.ipData)) {
    vm.ipDataStyle.color = "red";
    window.alert("Check IP address");
    return false;
  } else {
    vm.ipDataStyle.color = "black";
  }
  let uint8Array = [];
  let binaryString = "";
  uint8Array =
    vm.rbInputData == "el"
      ? createUint8ArrayFromElData(el)
      : createUint8ArrayFromFreeData(freeData);

  if (uint8Array !== false) {
    sendUdp(ipData, uint8Array);

    // push "Sent Data" to LOG
    const packet_id = "packet-" + packetId++;
    const pkt = {
      id: packet_id,
      timeStamp: timeStamp(),
      direction: "T",
      ip: ipData,
      data: uint8Array,
    };
    dataLogArray.push(pkt);
    displayLog();
  }
}

function createUint8ArrayFromElData(el) {
  if (!checkInputValue("deoj", vm.el.deojData)) {
    vm.deojDataStyle.color = "red";
    window.alert("Check DEOJ");
    return false;
  } else {
    vm.deojDataStyle.color = "black";
  }
  if (!checkInputValue("esv", vm.el.esvData)) {
    vm.esvDataStyle.color = "red";
    window.alert("Check ESV");
    return false;
  } else {
    vm.esvDataStyle.color = "black";
  }
  if (!checkInputValue("epc", vm.el.epcData)) {
    vm.epcDataStyle.color = "red";
    window.alert("Check EPC");
    return false;
  } else {
    vm.epcDataStyle.color = "black";
  }
  if (!checkInputValue("edt", vm.el.edtData)) {
    vm.edtDataStyle.color = "red";
    window.alert("Check EDT");
    return false;
  } else {
    vm.edtDataStyle.color = "black";
  }
  let uint8Array = [0x10, 0x81]; // EHD
  tid = tid == 0xffff ? 0 : tid + 1;
  uint8Array.push(Math.floor(tid / 16), tid % 16); // TID
  uint8Array.push(0x05, 0xff, 0x01); // SEOJ
  for (let data of hex2Array(el.deojData)) {
    // DEOJ
    uint8Array.push(data);
  }
  uint8Array.push(parseInt(el.esvData, 16)); // ESV
  uint8Array.push(0x01); // OPC
  uint8Array.push(parseInt(el.epcData, 16)); // EPC
  const esv = parseInt(el.esvData, 16);
  if (
    esv == 0x62 ||
    esv == 0x63 ||
    esv == 0x71 ||
    esv == 0x7a ||
    esv == 0x7e ||
    esv == 0x50 ||
    esv == 0x51 ||
    esv == 0x52 ||
    esv == 0x53 ||
    esv == 0x5e
  ) {
    uint8Array.push(0x00); // PDC
  } else {
    // EPC= 0x60:SetI, 0x61:SetC, 0x6E:SetGet, 0x72:Get_Res, 0x73:INF, 0x74:INFC,
    const edtArray = hex2Array(el.edtData);
    uint8Array.push(edtArray.length); // PDC
    for (let data of hex2Array(el.edtData)) {
      // EDT
      uint8Array.push(data);
    }
  }
  return uint8Array;
}

// string で表記された HEX を 1byte 毎の数値に変換する。
// string 表記は先頭に "0x" があってもなくてもいい
// 例1："0x123456" -> [0x12, 0x34, 0x56]
// 例2："123456" -> [0x12, 0x34, 0x56]
function hex2Array(hex) { // hex:string, return:uint8[]
  if (hex.slice(0, 2) != "0x") {
    hex = "0x" + hex;
  }
  let array = [];
  const bytes = (hex.length - 2) / 2;
  for (let i = 0; i < bytes; i++) {
    array.push(parseInt(hex.slice((i + 1) * 2, (i + 1) * 2 + 2), 16));
  }
  return array;
}

function createUint8ArrayFromFreeData(freeData) {
  if (!checkInputValue("free", vm.freeData)) {
    // console.log("vm.freeDataStyle.color: ", vm.freeDataStyle.color);
    vm.freeDataStyle.color = "red";
    window.alert("Check Free data");
    return false;
  } else {
    vm.freeDataStyle.color = "black";
  }
  let uint8Array = [];
  let arrayFromFreeData = freeData.split(",");
  for (let value of arrayFromFreeData) {
    uint8Array.push(parseInt(value.trim(), 16));
  }
  return uint8Array;
}

// SEARCH ボタンがクリックされると、ノード宛にEPC:D6のGETをマルチキャスト送信する
// UIのデータの種類のラジオボタンに影響されないように、elもfreeDataも設定する
function buttonClickSearch() {
  const ipData = "224.0.23.0";
  const el = {
    deojData: "0x0EF001",
    esvData: "0x62",
    epcData: "0xD6",
    edtData: "",
  };
  const freeData = "10,81,00,04,05,FF,01,0E,F0,01,62,01,D6,00";
  buttonClickSend(ipData, el, freeData);
}

// パケットモニタのデータをログに保存する
function saveLog() {
  let log = "";
  for (let dataLog of dataLogArray) {
    log =
      log +
      dataLog.timeStamp +
      "," +
      dataLog.direction +
      "," +
      dataLog.ip +
      "," +
      elFormat(dataLog.data) +
      "\n";
  }

  const date = new Date();
  let year = date.getFullYear();
  let month = (date.getMonth() + 1).toString();
  let day = date.getDate().toString();
  let hour = date.getHours().toString();
  let minute = date.getMinutes().toString();
  let second = date.getSeconds().toString();
  month = month.length == 1 ? "0" + month : month;
  day = day.length == 1 ? "0" + day : day;
  hour = hour.length == 1 ? "0" + hour : hour;
  minute = minute.length == 1 ? "0" + minute : minute;
  second = second.length == 1 ? "0" + second : second;
  const filename =
    "ssngLog_" + year + month + day + hour + minute + second + ".txt";

  const buffer = Buffer.from(log);
  fs.writeFile(os.homedir() + logDirName + "/" + filename, buffer, (err) => {
    if (err) console.log("Error: Can not save a log file.");

    // send notification
    const message = "Log is saved at " + os.homedir() + logDirName;
    const myNotification = new Notification('Title', {
      body: message
    })
    
    myNotification.onclick = () => {
      console.log('Notification clicked')
    }
  });

}

// パケットモニタ表示をクリアする
function clearLog() {
  packetId = 0;
  dataLogArray.length = 0;
  vm.packet_list = [];
  vm.packetDetail = "";
}

// パケットモニタで選択中のラインのパケットを解析して表示する
function packetMonitorShowPacketDetail(event) {
  if (this.active_packet_id) {
    $("#" + this.active_packet_id).removeClass("active");
    this.active_packet_id = "";
  }
  $("#" + event.target.id).addClass("active");
  this.active_packet_id = event.target.id;

  // 現在選択中のパケット ID
  console.log('active_packet_id', this.active_packet_id);
  let pno = this.active_packet_id;
  // reverse ボタンが選択されていると、IDは逆順になる
  if (vm.rbOrder == "reverseOrder") {
    pno = vm.packet_list.length - pno - 1;
  }

  // packetの解析結果の表示
  // console.log("showPacketDetail", pno, vm.packet_list[pno], vm.packet_list[pno].data);
  // vm.packetDetail = analyzeData(dataLogArray[pno].data);
  vm.packetDetail = analyzeData(vm.packet_list[pno].data);
}

// パケットモニタ部で、カーソルの上下キーに選択中のラインを上下させる
function packetMonitorUpDownList(event) {
  // console.log('packetMonitorUpDownList', event);
  event.preventDefault();
  event.stopPropagation();
  // 選択中のパケット行がなければ終了
  if (!this.active_packet_id) {
    console.log('no selected line!');
    return;
  }
  // 現在選択中のパケット ID
  let pno = this.active_packet_id;

  let c = event.keyCode;
  let k = event.key;
  // console.log('pno', pno, 'c', c, 'k', k);
  if (c === 38 || k === "ArrowUp") {
    // 上矢印キー
    if (vm.rbOrder == "normalOrder") {
      if (pno-- < 0) {
        pno = 0;
      }
    } else {
      if (pno++ >= dataLogArray.length) {
        pno = dataLogArray.length - 1;
      }
    }
  } else if (c === 40 || k === "ArrowDown") {
    // 下矢印キー
    if (vm.rbOrder == "normalOrder") {
      if (pno++ >= dataLogArray.length) {
        pno = dataLogArray.length - 1;
      }
    } else {
      if (pno-- < 0) {
        pno = 0;
      }
    }
  } else {
    return;
  }
  // 遷移したパケット行にフォーカスする
  // console.log('$(pno).focus();', pno);
  $("#" + pno).focus();
}
