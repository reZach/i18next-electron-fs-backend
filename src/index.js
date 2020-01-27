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
                ipcRenderer.on(channel, (event, args) => func(args));
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

    // Calls a function with args with a set delay
    writeWrapper(func, args, delay) {
        setTimeout(func.apply(this, args), delay);
    }

    // Writes a given translation data to a file
    write(filename) {

        // Lock filename
        this.writeQueue[filename].locked = true;

        // First, get the existing translation data from file
        this.requestFileRead(filename, (error, data) => {

            if (error) {
                this.writeQueue[filename].locked = false;
                throw `Error occurred when trying to read file '${filename}': ${error}.`;
            }

            let keySeparator = !!this.i18nextOptions.keySeparator; // Do we have a key separator or not?
            let updates = this.writeQueue[filename].updates;
            let callbacks = [];
            for (let i = 0; i < updates.length; i++) {

                // If we have no key separator set, simply update the translation value
                if (!keySeparator) {
                    data[updates[i].key] = updates[i].fallbackValue;
                } else {
                    // Created the nested object structure based on the key separator, and merge that
                    // into the existing translation data
                    data = mergeNested(data, updates[i].key, this.i18nextOptions.keySeparator, updates[i].fallbackValue);
                }

                // Keep track of any callbacks we need to do
                if (updates[i].callback !== null) callbacks.push(updates[i].callback);
            }

            // We just applied all updates from the writeQueue,
            // so delete this object so we can copy any pending
            // updates from the writeQueueBuffer down below
            delete this.writeQueue[filename];


            // Calling an anonymous function so we can bind 'this' to
            // this class instance and have access to variables inside
            let anonymousBind = function () {

                // Move items from buffer
                let bufferKeys = Object.keys(this.writeQueueBuffer);
                for (let j = 0; j < bufferKeys.length; j++) {
                    this.writeQueue[bufferKeys[j]] = this.writeQueueBuffer[bufferKeys[j]];
                    delete this.writeQueueBuffer[bufferKeys[j]];
                }

                // If any items were copied into the writeQueue, we should
                // unlock the queue and start the timeout to write to file
                if (typeof this.writeQueue[filename] !== "undefined" && Object.keys(this.writeQueue[filename]).length > 0) {
                    // Unlock filename
                    this.writeQueue[filename].locked = false;

                    // Re-add timeout if elements exist
                    this.writeQueue[filename].timeout = this.writeWrapper(this.write, [filename], this.backendOptions.delay);
                }
            }.bind(this);
            this.requestFileWrite(filename, data, callbacks, anonymousBind);
        });

        // Unlock filename
        this.writeQueue[filename].locked = false;
    }

    // Adds requests to the queue to update files;
    // depending on the state of the writeQueue, we will
    // insert these requests to write to file in different
    // places
    addToWriteQueue(filename, key, fallbackValue, callback) {
        let obj; // holds properties for the queue


        if (typeof this.writeQueue[filename] === "undefined") {
            obj = {
                updates: [{
                    key,
                    fallbackValue,
                    callback
                }],
                locked: false
            };

            // re-update timeout
            this.writeQueue[filename] = obj;
            obj.timeout = this.writeWrapper(this.write, [filename], this.backendOptions.delay);
        } else if (!this.writeQueue[filename].locked) {
            obj = this.writeQueue[filename];
            obj.updates.push({
                key,
                fallbackValue,
                callback
            });

            // re-update timeout
            this.writeQueue[filename] = obj;
            obj.timeout = this.writeWrapper(this.write, [filename], this.backendOptions.delay);
        } else {

            // Hold any updates if we are currently locked on that filename;
            // we'll run these when we can later
            if (typeof this.writeQueueBuffer[filename] === "undefined") {
                this.writeQueueBuffer[filename] = {
                    updates: [{
                        key,
                        fallbackValue,
                        callback
                    }]
                };
            } else {
                this.writeQueueBuffer[filename].updates.push({
                    updates: [{
                        key,
                        fallbackValue,
                        callback
                    }]
                });
            }
        }
    }

    requestFileWrite(filename, data, callbacks, onCompleteCallback = null) {
        const {
            i18nextElectronBackend
        } = this.backendOptions;


        // Save the callback for this request so we
        // can execute once the ipcRender process returns
        // with a value from the ipcMain process
        var key;
        if (callbacks.length > 0) {
            for (let i = 0; i < callbacks.length; i++) {
                key = `${UUID.generate()}`;
                this.writeCallbacks[key] = {
                    callback: callbacks[i]
                };

                // Send out the message to the ipcMain process
                i18nextElectronBackend.send(writeFileRequest, {
                    key,
                    filename,
                    data
                });
            }
        } else {
            key = `${UUID.generate()}`;

            // Send out the message to the ipcMain process
            i18nextElectronBackend.send(writeFileRequest, {
                key,
                filename,
                data
            });
        }

        // Run a callback if present
        if (onCompleteCallback !== null) {
            onCompleteCallback();
        }
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

        for (let i = 0; i < languages.length; i++) {
            filename = this.services.interpolator.interpolate(addPath, {
                lng: languages[i],
                ns: namespace
            });

            this.addToWriteQueue(filename, key, fallbackValue, callback);
        }
    }
}
Backend.type = "backend";

export default Backend;