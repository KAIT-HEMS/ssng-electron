// main.js for ssng-electron
// 2021.02.24
// Copyright (c) 2021 Kanagawa Institute of Technology
// Released under the MIT License.

"use strict";

// const appname = "SSNG";
const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");

const path = require("path");
const util = require("util");
const os = require("os");
const fs = require("fs");

let mainWindow = null;
const mainFunction = require("./ssng.js");

// foreground
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      worldSafeExecuteJavaScript: true,
      preload: "http://localhost:3001/index.js",
    },
  });

  // menu
  const menuItems = [
    {
      label: app.name,
      submenu: [
        { role: 'quit' },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { label: 'close socket',
          click:()=>{ console.log("close socket");}
        }
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(menuItems);
  Menu.setApplicationMenu(menu); // set the modified menu

  mainWindow.loadURL("http://localhost:3001/");
  mainWindow.openDevTools();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// app.on("ready", createWindow);
app.on('ready', () => {
  createWindow();
  mainFunction.funcIndex();
});

// アプリケーションがアクティブになった時の処理
app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on('before-quit', () => {
  console.log('app.before-quit');
  mainFunction.closeSocket();
});