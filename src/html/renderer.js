// renderer.js for SSNG-electron
// 2021.04.06

const VERSION = "0.2.0 2021.04.06";
let tid = 0;
let packetId = 0;
let active_packet_id = "";
let dataLogArray = [];
let analyzedData = "";

console.log("SSNG" + VERSION);

// レンダラープロセス（ウェブページ）
const dgram = require("dgram");
const os = require("os");
const fs = require("fs");

const EL_port = 3610;
const EL_mcAddress = "224.0.23.0";

const epcNode = {
  0x80: [0x30],
  0x82: [0x01, 0x0c, 0x01, 0x00],
  0x83: [
    0xfe,
    0x00,
    0x00,
    0x77,
    0x00,
    0x01,
    0x02,
    0x03,
    0x04,
    0x05,
    0x06,
    0x07,
    0x08,
    0x09,
    0x0a,
    0x0b,
    0x0c,
  ],
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

// get a list of local IP address(ipv4)
// {
//   ipv4:[{name:<device name:string>, address:<IP address:string>}],
//   ipv6:[{name:<device name:string>, address:<IP address:string>}]
// }
const localAddress = getLocalAddress();

const ipv4 = localAddress.ipv4[0].address;

// create a folder "ssng-log" to save log files
// $HOME/ssng-log
const homedir = os.homedir();
const logdir = homedir + '/ssng-log';

fs.readdir(homedir, function (err, files) {
  if (err) throw err;
  if (files.includes("ssng-log") == false) {
    fs.mkdir(logdir, (err) => {
      if (err) console.log("Error: mkdir");
    });
  }
});

// UDP
const server = dgram.createSocket("udp4");
server.on("error", (err) => {
  console.log(`server error:\n${err.stack}`);
  server.close();
});

server.on("listening", () => {
  const address = server.address();
  console.log(`server listening ${address.address}:${address.port}`);
});

// receive UDP data
server.on("message", (msg, rinfo) => {
  let uint8Array = [];
  for (let i = 0; i < msg.length; i++) {
    uint8Array.push(toStringHex(msg.readUInt8(i), 1));
  }
  console.log(
    `UDP Receive: from ${rinfo.address}:${rinfo.port} data: ${uint8Array}`
  );

  const packet_id = 'packet-' + packetId++;
  const pkt = {
      id:packet_id,
      timeStamp:timeStamp(),
      direction:"R",
      ip:rinfo.address,
      data:uint8Array
  }
  dataLogArray.push(pkt);
  displayLog();
});

// bind port and set for multicast, then start listening
server.bind(EL_port, function () {
  server.addMembership(EL_mcAddress);
  console.log("port bind OK!");
});

// 起動時にインスタンスリストをマルチキャスト送信する
sendUdp(EL_mcAddress, instanceList);

// send unicast UDP data
// ip: string, byteArray: array of uint8
function sendUdp(ip, byteArray) {
  // string:ip, array:byteArray
  const buffer = new Buffer.from(byteArray);
  const client = dgram.createSocket("udp4");
  client.send(buffer, 0, buffer.length, EL_port, ip, function (err, bytes) {
    client.close();
  });
}

// send multicast
function sendUdpMc(ip, byteArray, src) {
  // string:ip, array:byteArray
  const buffer = new Buffer.from(byteArray);
  const client = dgram.createSocket("udp4");
  client.bind(0, () => {
    client.setMulticastInterface(src);
  });
  client.send(buffer, 0, buffer.length, EL_port, ip, function (err, bytes) {
    client.close();
  });
}

// 未使用
function elGet(ip, uint8Array) {
  // string:ip, array: uint8Array
  // console.log("elGet ip= ", ip, "uint8Array= ", uint8Array);
  const elPacket = parseEL(uint8Array);
  if (elPacket !== null) {
    const deoj = elPacket.deoj[0] * 256 + elPacket.deoj[1];
    if (deoj == 0x05ff && elPacket.esv == 0x62) {
      // controller and Get
      const uint8ArraySend = createUint8ArraySend(elPacket, epcDevice);
      // console.log("elGet ip= ", ip, "uint8ArraySend= ", uint8ArraySend);
      sendUdp(ip, uint8ArraySend);
    } else if (deoj == 0x0ef0 && elPacket.esv == 0x62) {
      // node and Get
      const uint8ArraySend = createUint8ArraySend(elPacket, epcNode);
      // console.log("elGet ip= ", ip, "uint8ArraySend= ", uint8ArraySend);
      sendUdp(ip, uint8ArraySend);
    }
  }
}

// 未使用
function createUint8ArraySend(elPacket, epcs) {
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
  uint8ArraySend[2] = elPacket.tid[0]; // tid
  uint8ArraySend[3] = elPacket.tid[1]; // tid
  uint8ArraySend[4] = elPacket.deoj[0]; // seoj
  uint8ArraySend[5] = elPacket.deoj[1]; // seoj
  uint8ArraySend[6] = elPacket.deoj[2]; // seoj
  uint8ArraySend[7] = elPacket.seoj[0]; // deoj
  uint8ArraySend[8] = elPacket.seoj[1]; // deoj
  uint8ArraySend[9] = elPacket.seoj[2]; // deoj
  uint8ArraySend[12] = elPacket.epc; // epc
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

// 未使用
function parseEL(uint8Array) {
  let elr = {};
  if (uint8Array.length < 14) {
    console.log("parseEL ERROR: UDP data is less than 14 bytes.");
    return null;
  }
  const ehd = uint8Array[0] * 256 + uint8Array[1];
  if (ehd != 0x1081) {
    console.log("parseEL ERROR: EHD is wrong");
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

// Get a list of Local IP Address
// return data: 
// {
//   ipv4:[{name:<device name:string>, address:<IP address:string>}],
//   ipv6:[{name:<device name:string>, address:<IP address:string>}]
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
    buttonClickCloseSocket: function () {
      buttonClickCloseSocket();
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
for (let adr of localAddress.ipv4){
  vm.myIps.push(adr.address);
  console.log(adr.name, adr.address);
}

function displayLog() {
  let log = [];
  for (let dataLog of dataLogArray) {
    const esv = dataLog.data[10];
    const pkt = {
      id: dataLog.id,
      timeStamp: dataLog.timeStamp,
      direction: dataLog.direction,
      address: dataLog.ip,
      hex: elFormat(dataLog.data),
    };
    if (dataLog.direction == "T" || filterEsv(esv)) {
      log.push(pkt);
    }
  }
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

  function filterEsv(esv) {
    if (!vm.filters.includes("showGet") && esv == '62') {
      return false;
    }
    if (!vm.filters.includes("showInf") && esv == '73') {
      return false;
    }
    if (!vm.filters.includes("showGetres") && esv == '72') {
      return false;
    }
    if (
      !vm.filters.includes("showSNA") &&
      (esv == '50' || esv == '51' || esv == '52' || esv == '53' || esv == '5e')
    ) {
      return false;
    }
    return true;
  }
}

function timeStamp() {
  const date = new Date();
  let hour = date.getHours().toString();
  let minute = date.getMinutes().toString();
  let second = date.getSeconds().toString();
  hour = hour.length == 1 ? "0" + hour : hour;
  minute = minute.length == 1 ? "0" + minute : minute;
  second = second.length == 1 ? "0" + second : second;
  return hour + ":" + minute + ":" + second;
}

function analyzeData(uint8Array) {
  // uint8Array: [UInt8]
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

function buttonClickSend(ipData, el, freeData) {
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

function hex2Array(hex) {
  // hex: string of this format 0xXXXX or XXXX
  if (hex.slice(0, 2) != "0x") {
    hex = "0x" + hex;
  }
  let array = [];
  const bytes = (hex.length - 2) / 2;
  for (let i = 0; i < bytes; i++) {
    array.push(parseInt(hex.slice((i + 1) * 2, (i + 1) * 2 + 2), 16));
  }
  return array; // array: array of byte data
}

function createUint8ArrayFromFreeData(freeData) {
  if (!checkInputValue("free", vm.freeData)) {
    console.log("vm.freeDataStyle.color: ", vm.freeDataStyle.color);
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
  // const message = { log: log };

  console.log('Save Log', log);
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
  // fs.writeFile("log/" + filename, buffer, (err) => {
  fs.writeFile(logdir + "/" + filename, buffer, (err) => {
    if (err) console.log("Error: Can not save a log file.");
    console.log("The file has been saved!");
  });

}

function clearLog() {
  packetId = 0;
  dataLogArray.length = 0;
  vm.packet_list = [];
  vm.packetDetail = "";
}

function packetMonitorShowPacketDetail(event) {
  if (this.active_packet_id) {
    $("#" + this.active_packet_id).removeClass("active");
    this.active_packet_id = "";
  }
  let t = event.target;
  $("#" + t.id).addClass("active");
  this.active_packet_id = t.id;

  // 現在選択中のパケット ID
  let id_parts = this.active_packet_id.split("-");
  let pno = parseInt(id_parts[1], 10);

  // packetの解析結果の表示
  vm.packetDetail = analyzeData(dataLogArray[pno].data);
}

function packetMonitorUpDownList(event) {
  event.preventDefault();
  event.stopPropagation();
  // 選択中のパケット行がなければ終了
  if (!this.active_packet_id) {
    return;
  }
  // 現在選択中のパケット ID
  let id_parts = this.active_packet_id.split("-");
  let pno = parseInt(id_parts[1], 10);

  let c = event.keyCode;
  let k = event.key;
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
  $("#packet-" + pno).focus();
}
