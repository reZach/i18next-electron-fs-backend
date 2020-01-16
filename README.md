# i18next-electron-fs-backend
This is an i18next library designed to work with [secure-electron-template](https://github.com/reZach/secure-electron-template). The library is a rough copy of [i18next-node-fs-backend](https://github.com/i18next/i18next-node-fs-backend) but using IPC (inter-process-communication) to request a file be read or written from the electron's [main process](https://electronjs.org/docs/api/ipc-main).

## How to install

### Install the package
`npm i i18next-electron-fs-backend`

### Add into your i18next config
Based on documentation for a [i18next config](https://www.i18next.com/how-to/add-or-load-translations#load-using-a-backend-plugin), import the backend.
```javascript
import i18n from "i18next";
import {
  initReactI18next
} from "react-i18next";
import backend from "i18next-electron-fs-backend";

i18n
  .use(backend)
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: "./app/localization/locales/{{lng}}/{{ns}}.json",
      addPath: "./app/localization/locales/{{lng}}/{{ns}}.missing.json",
      ipcRenderer: window.api.i18nextElectronBackend
    },

    // other options you might configure
    debug: true,
    saveMissing: true,
    saveMissingTo: "current",
    lng: "en"
  });

export default i18n;
```

### Update your preload.js script
```javascript
const {
    contextBridge,
    ipcRenderer
} = require("electron");
const backend = require("i18next-electron-fs-backend");

contextBridge.exposeInMainWorld(
    "api", {
        i18nextElectronBackend: backend.preloadBindings(ipcRenderer)
    }
);
```

### Update your main.js script
```javascript
const {
  app,
  BrowserWindow,
  session,
  ipcMain
} = require("electron");
const backend = require("i18next-electron-fs-backend");
const fs = require("fs");

let win;

async function createWindow() {  
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    }
  });

  // ...
}

app.on("ready", createWindow);

backend.mainBindings(ipcMain, win, fs); // <- configures the backend
```

## Options
tbd