import {
    cloneDeep
} from "lodash";
import {
    UUID,
    mergeNested,
    groupByArray
} from "./utils";

// CONFIGS
const defaultOptions = {
    debug: false,
    loadPath: "/locales/{{lng}}/{{ns}}.json", // Where the translation files get loaded from
    addPath: "/locales/{{lng}}/{{ns}}.missing.json" // Where the missing translation files get generated
};
// Electron-specific; must match mainIpc
export const readFileRequest = "readfile-request";
export const writeFileRequest = "writefile-request";
export const readFileResponse = "readfile-response";
export const writeFileResponse = "writefile-response";
export const changeLanguageRequest = "changelanguage-request";

// This is the code that will go into the preload.js file
// in order to set up the contextBridge api (IF sandbox is not enabled)
export const preloadBindings = function (ipcRenderer) {
    return {
        send: (channel, data) => {
            const validChannels = [readFileRequest, writeFileRequest];
            if (validChannels.includes(channel)) {
                ipcRenderer.send(channel, data);
            }
        },
        onReceive: (channel, func) => {
            const validChannels = [readFileResponse, writeFileResponse];
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
// in order to set up the contextBridge api (IF sandbox IS enabled).
// This code NEEDS TO BE A COPY OF preloadBindings, with no
// references to variables, since it can't have any dependencies
export const preloadBindingsSandbox = (function (ipcRenderer) {
    return {
        send: (channel, data) => {
            if (["readfile-request", "writefile-request"].includes(channel)) {
                ipcRenderer.send(channel, data);
            }
        },
        onReceive: (channel, func) => {
            if (["readfile-response", "writefile-response"].includes(channel)) {
                // Deliberately strip event as it includes "sender"
                ipcRenderer.on(channel, (event, args) => func(args));
            }
        },
        onLanguageChange: (func) => {
            // Deliberately strip event as it includes "sender"
            ipcRenderer.on("changelanguage-request", (event, args) => func(args));
        }
    };
}).toString().replaceAll(" ", "\\s").replaceAll("\"", "'");

// This is the code that will go into the main.js file
// in order to set up the ipc main bindings
export const mainBindings = function (ipcMain, browserWindow, fs) {
    ipcMain.on(readFileRequest, (IpcMainEvent, args) => {
        const callback = function (error, data) {
            this.webContents.send(readFileResponse, {
                key: args.key,
                error,
                data: typeof data !== "undefined" && data !== null ? data.toString() : ""
            });
        }.bind(browserWindow);
        fs.readFile(args.filename, "utf8", callback);
    });

    ipcMain.on(writeFileRequest, (IpcMainEvent, args) => {
        const callback = function (error) {
            this.webContents.send(writeFileResponse, {
                keys: args.keys,
                error
            });
        }.bind(browserWindow);


        // https://stackoverflow.com/a/51721295/1837080
        let separator = "/";
        const windowsSeparator = "\\";
        if (args.filename.includes(windowsSeparator)) separator = windowsSeparator;
        const root = args.filename.slice(0, args.filename.lastIndexOf(separator));

        fs.mkdir(root, {
            recursive: true
        }, (error) => {
            if (error){
                console.error(error);
            }
            fs.writeFile(args.filename, JSON.stringify(args.data), callback);
        });
    });
};

// Clears the bindings from ipcMain;
// in case app is closed/reopened (only on macos)
export const clearMainBindings = function (ipcMain) {
    ipcMain.removeAllListeners(readFileRequest);
    ipcMain.removeAllListeners(writeFileRequest);
}

// Template is found at: https://www.i18next.com/misc/creating-own-plugins#backend;
// also took code from: https://github.com/i18next/i18next-node-fs-backend
class Backend {
    constructor(services, backendOptions = {}, i18nextOptions = {}) {
        this.init(services, backendOptions, i18nextOptions);

        this.readCallbacks = {}; // Callbacks after reading a translation
        this.writeCallbacks = {}; // Callbacks after writing a missing translation
        this.writeTimeout = undefined; // A timer that will initate writing missing translations to files
        this.writeQueue = []; // An array to hold missing translations before the writeTimeout occurs
        this.writeQueueOverflow = []; // An array to hold missing translations while the writeTimeout's items are being written to file
        this.useOverflow = false; // If true, we should insert missing translations into the writeQueueOverflow        
    }

    init(services, backendOptions, i18nextOptions) {
        if (typeof window !== "undefined" && typeof window.api.i18nextElectronBackend === "undefined") {
            throw "'window.api.i18nextElectronBackend' is not defined! Be sure you are setting up your BrowserWindow's preload script properly!";
        }

        this.services = services;
        this.backendOptions = {
            ...defaultOptions,
            ...backendOptions,
            i18nextElectronBackend: typeof window !== "undefined" ? window.api.i18nextElectronBackend : undefined
        };
        this.i18nextOptions = i18nextOptions;

        // log-related
        const logPrepend = "[i18next-electron-fs-backend:";
        this.mainLog = `${logPrepend}main]=>`;
        this.rendererLog = `${logPrepend}renderer]=>`;

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
            //   keys
            //   error
            // }

            const keys = args.keys;
            for (let i = 0; i < keys.length; i++) {
                let callback;

                // Write methods don't have any callbacks from what I've seen,
                // so this is called more than I thought; but necessary!
                if (typeof this.writeCallbacks[keys[i]] === "undefined") return;

                if (args.error) {
                    callback = this.writeCallbacks[keys[i]].callback;
                    delete this.writeCallbacks[keys[i]];
                    callback(args.error);
                } else {
                    callback = this.writeCallbacks[keys[i]].callback;
                    delete this.writeCallbacks[keys[i]];
                    callback(null, true);
                }
            }
        });
    }

    // Writes a given translation to file
    write(writeQueue) {
        const {
            debug,
            i18nextElectronBackend
        } = this.backendOptions;

        // Group by filename so we can make one request
        // for all changes within a given file
        const toWork = groupByArray(writeQueue, "filename");

        for (let i = 0; i < toWork.length; i++) {
            const anonymous = function (error, data) {
                if (error) {
                    console.error(`${this.rendererLog} encountered error when trying to read file '${filename}' before writing missing translation ('${key}'/'${fallbackValue}') to file. Please resolve this error so missing translation values can be written to file. Error: '${error}'.`);
                    return;
                }

                const keySeparator = !!this.i18nextOptions.keySeparator; // Do we have a key separator or not?
                let writeKeys = [];

                for (let j = 0; j < toWork[i].values.length; j++) {

                    // If we have no key separator set, simply update the translation value
                    if (!keySeparator) {
                        data[toWork[i].values[j].key] = toWork[i].values[j].fallbackValue;
                    } else {
                        // Created the nested object structure based on the key separator, and merge that
                        // into the existing translation data
                        data = mergeNested(data, toWork[i].values[j].key, this.i18nextOptions.keySeparator, toWork[i].values[j].fallbackValue);
                    }

                    const writeKey = `${UUID.generate()}`;
                    if (toWork[i].values[j].callback) {
                        this.writeCallbacks[writeKey] = {
                            callback: toWork[i].values[j].callback
                        };
                        writeKeys.push(writeKey);
                    }
                }

                // Send out the message to the ipcMain process
                if (debug) {
                    console.log(`${this.rendererLog} requesting the missing key '${key}' be written to file '${filename}'.`);
                }
                i18nextElectronBackend.send(writeFileRequest, {
                    keys: writeKeys,
                    filename: toWork[i].key,
                    data
                });
            }.bind(this);
            this.requestFileRead(toWork[i].key, anonymous);
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
        const key = `${UUID.generate()}`;
        this.readCallbacks[key] = {
            callback
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
        const filename = this.services.interpolator.interpolate(loadPath, {
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

        // Create the missing translation for all languages
        for (let i = 0; i < languages.length; i++) {
            filename = this.services.interpolator.interpolate(addPath, {
                lng: languages[i],
                ns: namespace
            });

            // If we are currently writing missing translations from writeQueue,
            // temporarily store the requests in writeQueueOverflow until we are
            // done writing to file
            if (this.useOverflow) {
                this.writeQueueOverflow.push({
                    filename,
                    key,
                    fallbackValue,
                    callback
                });
            } else {
                this.writeQueue.push({
                    filename,
                    key,
                    fallbackValue,
                    callback
                });
            }
        }

        // Fire up the timeout to process items to write
        if (this.writeQueue.length > 0 && !this.useOverflow) {

            // Clear out any existing timeout if we are still getting translations to write
            if (typeof this.writeTimeout !== "undefined") {
                clearInterval(this.writeTimeout);
            }

            this.writeTimeout = setInterval(function () {

                // Write writeQueue entries, then after,
                // fill in any from the writeQueueOverflow
                if (this.writeQueue.length > 0){
                    this.write(cloneDeep(this.writeQueue));                    
                }
                this.writeQueue = cloneDeep(this.writeQueueOverflow);
                this.writeQueueOverflow = [];

                if (this.writeQueue.length === 0) {
                    
                    // Clear timer
                    clearInterval(this.writeTimeout);
                    delete this.writeTimeout;
                    this.useOverflow = false;
                }
            }.bind(this), 1000);
            this.useOverflow = true;
        }
    }
}
Backend.type = "backend";

export default Backend;