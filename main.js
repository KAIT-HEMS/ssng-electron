// main.js for ssng-electron
// 2021.02.24
// Copyright (c) 2021 Kanagawa Institute of Technology
// Released under the MIT License.

"use strict";

const appname = "SSNG";
const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");

const path = require("path");
const util = require("util");
const os = require("os");
const fs = require("fs");

// electronのmain window
let mainWindow = null;
const mainFunction = require("./ssng.js");
mainFunction.funcIndex();

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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("ready", createWindow);

// アプリケーションがアクティブになった時の処理
app.on("activate", () => {
  // メインウィンドウが消えている場合は再度メインウィンドウを作成する
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on('before-quit', () => console.log('app.before-quit'));