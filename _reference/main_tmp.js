// main.js for ssng-electron
// 2021.03.19
// Copyright (c) 2021 Kanagawa Institute of Technology
// Released under the MIT License.

const {app, BrowserWindow} = require('electron')
const path = require('path')
const mSsng = require("./ssng.js");

// メインプロセス
const { ipcMain } = require('electron')
ipcMain.on('asynchronous-message', (event, arg) => {
  console.log(arg)  // "ping"を表示
  event.reply('asynchronous-reply', 'pong（非同期）')
})


// ipcMain.on('synchronous-message', (event, arg) => {
//   console.log(arg)  // "ping"を表示
//   event.returnValue = 'pong（同期）'
// })

function createWindow () {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      // nodeIntegration: true
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // and load the index.html of the app.
  mainWindow.loadFile('./html/index.html')

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow()
  
  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

////////////////////
mSsng.funcIndex();
