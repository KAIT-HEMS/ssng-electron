// main.js for ssng-electron
// 2021.04.06
// Copyright (c) 2021 Kanagawa Institute of Technology
// Released under the MIT License.
// 
// renderer.js で UDP の送受信を行う

"use strict";

const {app, BrowserWindow, Menu} = require('electron');
let mainWindow = null;

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 940,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // menu
  const menuItems = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { role: 'quit' }
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            const { shell } = require('electron')
            await shell.openExternal('http://sh-center.org/sdk')
          }
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(menuItems);
  Menu.setApplicationMenu(menu); // comment out for default menu

  // and load the index.html of the app.
  mainWindow.loadFile('./src/html/index.html');
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
