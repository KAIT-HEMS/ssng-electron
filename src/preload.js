// renderer.js for SSNG-electron
// 2021.04.09

const dgram = require("dgram");
const os = require("os");
const fs = require("fs");
const { Buffer } = global;

process.once('loaded', () => {
  global.native = {
    dgram: dgram,
    os: os,
    fs: fs,
    Buffer: Buffer
  };
});