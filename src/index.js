import {
    UUID,
    mergeNested
} from "./utils";

// CONFIGS
const defaultOptions = {
    loadPath: "/locales/{{lng}}/{{ns}}.json", // Where the translation files get loaded from
    addPath: "/locales/{{lng}}/{{ns}}.missing.json", // Where the missing translation files get generated
    delay: 300 // Delay before translations are written to file
};
// Electron-specific; must match mainIpc
export const readFileRequest = "ReadFile-Request";
export const writeFileRequest = "WriteFile-Request";
export const readFileResponse = "ReadFile-Response";
export const writeFileResponse = "WriteFile-Response";
export const changeLanguageRequest = "ChangeLanguage-Request";

// This is the code that will go into the preload.js file
// in order to set up the contextBridge api
export const preloadBindings = function (ipcRenderer) {
    return {
        send: (channel, data) => {
            let validChannels = [readFileRequest, writeFileRequest];
            if (validChannels.includes(channel)) {
                ipcRenderer.send(channel, data);
            }
        },
        onReceive: (channel, func) => {
            let validChannels = [readFileResponse, writeFileResponse];
            if (validChannels.includes(channel)) {
                // Deliberately strip event as it includes "sender"
                try {
                    ipcRenderer.on(channel, (event, args) => {
                
                        try{
                            console.log("success");
                            console.log(channel);
                            return func(args);
                        } catch (err){
                            console.error(err);
                            console.error(channel);
                        }                    
                    });
                } catch (e){
                    console.error(e);
                    console.error("failing ipcrenderer.on");
                }
                
            }
        },
        onLanguageChange: (func) => {
            // Deliberately strip event as it includes "sender"
            ipcRenderer.on(changeLanguageRequest, (event, args) => func(args));
        }
    };
};

// This is the code that will go into the main.js file
// in order to set up the ipc main bindings
export const mainBindings = function (ipcMain, browserWindow, fs) {
    ipcMain.on(readFileRequest, (IpcMainEvent, args) => {
        let callback = function (error, data) {
            this.webContents.send(readFileResponse, {
                key: args.key,
                error,
                data: typeof data !== "undefined" && data !== null ? data.toString() : ""
            });
        }.bind(browserWindow);
        fs.readFile(args.filename, callback);
    });

    ipcMain.on(writeFileRequest, (IpcMainEvent, args) => {
        let callback = function (error) {
            this.webContents.send(writeFileResponse, {
                key: args.key,
                error
            });
        }.bind(browserWindow);


        // https://stackoverflow.com/a/51721295/1837080
        let separator = "/";
        const windowsSeparator = "\\";
        if (args.filename.includes(windowsSeparator)) separator = windowsSeparator;
        let root = args.filename.slice(0, args.filename.lastIndexOf(separator));

        fs.mkdir(root, {
            recursive: true
        }, (error) => {
            fs.writeFile(args.filename, JSON.stringify(args.data), callback);
        });
    });
};

// Template is found at: https://www.i18next.com/misc/creating-own-plugins#backend;
// also took code from: https://github.com/i18next/i18next-node-fs-backend
class Backend {
    constructor(services, backendOptions = {}, i18nextOptions = {}) {
        this.init(services, backendOptions, i18nextOptions);

        this.readCallbacks = {};
        this.writeCallbacks = {};
        this.writeQueue = {};
        this.writeQueueBuffer = {};
    }

    init(services, backendOptions, i18nextOptions) {
        if (typeof window.api.i18nextElectronBackend === "undefined") {
            throw "'window.api.i18nextElectronBackend' is not defined! Be sure you are setting up your BrowserWindow's preload script properly!";
        }

        this.services = services;
        this.backendOptions = {
            ...defaultOptions,
            ...backendOptions,
            i18nextElectronBackend: window.api.i18nextElectronBackend
        };
        this.i18nextOptions = i18nextOptions;

        this.setupIpcBindings();
    }

    // Sets up Ipc bindings so that we can keep any node-specific
    // modules; (ie. 'fs') out of the Electron renderer process
    setupIpcBindings() {
        const {
            i18nextElectronBackend
        } = this.backendOptions;

        i18nextElectronBackend.onReceive(readFileResponse, (args) => {
            // args:
            // {
            //   key
            //   error
            //   data
            // }


            // Don't know why we need this line;
            // upon initialization, the i18next library
            // ends up in this .on([channel], args) method twice
            debugger;
            if (typeof this.readCallbacks[args.key] === "undefined") return;

            let callback;

            if (args.error) {
                // Failed to read translation file;
                // we pass back a fake "success" response
                // so that we create a translation file
                callback = this.readCallbacks[args.key].callback;
                delete this.readCallbacks[args.key];
                if (callback !== null && typeof callback === "function") callback(null, {});
            } else {
                let result;
                args.data = args.data.replace(/^\uFEFF/, "");
                try {
                    result = JSON.parse(args.data);
                } catch (parseError) {
                    parseError.message = `Error parsing '${args.filename}'. Message: '${parseError}'.`;
                    callback = this.readCallbacks[args.key].callback;
                    delete this.readCallbacks[args.key];
                    if (callback !== null && typeof callback === "function") callback(parseError);
                    return;
                }
                callback = this.readCallbacks[args.key].callback;
                delete this.readCallbacks[args.key];
                if (callback !== null && typeof callback === "function") callback(null, result);
            }
        });


        i18nextElectronBackend.onReceive(writeFileResponse, (args) => {
            // args:
            // {
            //   key
            //   error
            // }

            let callback;

            debugger;
            console.log("writefile callback");
            console.log(typeof this.writeCallbacks[args.key] === "undefined");
            // Write methods don't have any callbacks from what I've seen,
            // so this is called more than I thought; but necessary!
            if (typeof this.writeCallbacks[args.key] === "undefined") return;

            if (args.error) {
                callback = this.writeCallbacks[args.key].callback;
                delete this.writeCallbacks[args.key];
                callback(args.error);
            } else {
                callback = this.writeCallbacks[args.key].callback;
                delete this.writeCallbacks[args.key];
                callback(null, true);
            }
        });
    }

    // Writes a given translation to file
    write(filename, key, fallbackValue, callback) {        
        const {
            i18nextElectronBackend
        } = this.backendOptions;

        // First, get the existing translation data from file
        this.requestFileRead(filename, (error, data) => {
            if (error) {
                // todo
            }

            let keySeparator = !!this.i18nextOptions.keySeparator; // Do we have a key separator or not?

            // If we have no key separator set, simply update the translation value
            if (!keySeparator) {
                data[key] = fallbackValue;
            } else {
                // Created the nested object structure based on the key separator, and merge that
                // into the existing translation data
                data = mergeNested(data, key, this.i18nextOptions.keySeparator, fallbackValue);
            }

            let key = `${UUID.generate()}`;
            if (callback) {
                console.warn('callback is true');
                this.writeCallbacks[key] = {
                    callback
                };
            }

            // Send out the message to the ipcMain process
            debugger;
            i18nextElectronBackend.send(writeFileRequest, {
                key,
                filename,
                data
            });
        });
    }

    // Reads a given translation file
    requestFileRead(filename, callback) {
        const {
            i18nextElectronBackend
        } = this.backendOptions;

        // Save the callback for this request so we
        // can execute once the ipcRender process returns
        // with a value from the ipcMain process
        let key = `${UUID.generate()}`;
        this.readCallbacks[key] = {
            callback: callback
        };

        // Send out the message to the ipcMain process
        i18nextElectronBackend.send(readFileRequest, {
            key,
            filename
        });
    }

    // Reads a given translation file
    read(language, namespace, callback) {        
        const {
            loadPath
        } = this.backendOptions;
        let filename = this.services.interpolator.interpolate(loadPath, {
            lng: language,
            ns: namespace
        });

        this.requestFileRead(filename, (error, data) => {
            debugger;
            if (error) return callback(error, false); // no retry
            callback(null, data);
        });
    }

    // Not implementing at this time
    readMulti(languages, namespaces, callback) {
        throw "Not implemented exception.";
    }

    // Writes a missing translation to file
    create(languages, namespace, key, fallbackValue, callback) {
        const {
            addPath
        } = this.backendOptions;
        let filename;
        languages = typeof languages === "string" ? [languages] : languages;

        // Create the missing translation for all languages
        for (let i = 0; i < languages.length; i++) {
            filename = this.services.interpolator.interpolate(addPath, {
                lng: languages[i],
                ns: namespace
            });

            this.write(filename, key, fallbackValue, callback);
        }
    }
}
Backend.type = "backend";

export default Backend;