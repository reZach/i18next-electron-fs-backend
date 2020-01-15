import { UUID, mergeNested } from "./utils";

// CONFIGS
const defaultOptions = {
    loadPath: "/locales/{{lng}}/{{ns}}.json", // Where the translation files get loaded from
    addPath: "/locales/{{lng}}/{{ns}}.missing.json", // Where the missing translation files get generated
    delay: 300 // Delay before translations are written to file
};
// Electron-specific; must match mainIpc
const readChannel = "ReadFile";
const writeChannel = "WriteChannel";

// // Writes to the translation .json files
// let _writeFile = function (fs, filename, data, callback) {
//     fs.writeFile(filename, JSON.stringify(data), (error) => {
//         callback(error);
//     });
//     callback(null, "success");
// }

// Template is found at: https://www.i18next.com/misc/creating-own-plugins#backend;
// also took code from: https://github.com/i18next/i18next-node-fs-backend
class Backend {
    constructor(services, backendOptions = {}, i18nextOptions = {}) {
        if (typeof this.backendOptions.ipcRenderer === "undefined") {
            throw "Could not initialize because the 'ipcRenderer' option was not set!";
        }

        this.init(services, backendOptions, i18nextOptions);
        this.readCallbacks = {};
        this.writeCallbacks = {};
        this.writeQueue = {};
        this.writeQueueBuffer = {};
    }

    init(services, backendOptions, i18nextOptions) {
        this.services = services;
        this.backendOptions = {
            ...defaultOptions,
            ...backendOptions
        };
        this.i18nextOptions = i18nextOptions;
    }

    // Sets up Ipc bindings so that we can keep any node-specific
    // modules; (ie. 'fs') out of the Electron renderer process
    setupIpcBindings() {
        const {
            ipcRenderer
        } = this.backendOptions;

        ipcRenderer.on(readChannel, (IpcRendererEvent, args) => {
            // args:
            // {
            //   key
            //   error
            //   data
            // }
            let callback;

            if (args.error) {
                callback = this.readCallbacks[args.key].callback;
                delete this.readCallbacks[args.key];
                callback(error);
            } else {
                let result;
                args.data = data.replace(/^\uFEFF/, "");
                try {
                    result = JSON.parse(args.data);
                } catch (parseError) {
                    parseError.message = `Error parsing '${filename}'. Message: '${parseError}'.`;
                    callback = this.readCallbacks[args.key].callback;
                    delete this.readCallbacks[args.key];
                    callback(parseError);
                }
                callback = this.readCallbacks[args.key].callback;
                delete this.readCallbacks[args.key];
                callback(null, result);
            }
        });

        ipcRenderer.on(writeChannel, (IpcRendererEvent, args) => {
            // args:
            // {
            //   key
            //   error
            // }
            let callback;

            if (args.error) {
                callback = this.writeCallbacks[args.key].callback;
                delete this.writeCallbacks[args.key];
                callback(error);
            } else {
                callback = this.writeCallbacks[args.key].callback;
                delete this.writeCallbacks[args.key];
                callback(null, true);
            }
        });
    }

    writeWrapper(func, args, delay) {
        setTimeout(func.apply(null, args), delay);
    }

    write(filename) {
        // Lock filename
        this.writeQueue[filename].locked = true;

        this.requestFileRead(filename, (error, data) => {
            if (error){
                this.writeQueue[filename].locked = false;
                throw "err!";
            }

            let updates = this.writeQueue[filename].updates;
            let callbacks = [];
            for (let i = 0; i < updates.length; i++){
                data[updates[i][key]] = updates[i][fallbackValue];
                callbacks.push(updates[i].callback);
            }
            delete this.writeQueue[filename];

            this.requestFileWrite(filename, data, callbacks, () => {
                
                // Move items from buffer
                let bufferKeys = Object.keys(this.writeQueueBuffer);
                for (let j = 0; j < bufferKeys; j++){
                    this.writeQueue[bufferKeys[j]] = this.writeQueueBuffer[bufferKeys[j]];
                    delete this.writeQueueBuffer[bufferKeys[j]];
                }

                // Unlock filename
                this.writeQueue[filename].locked = false;

                // Re-add timeout if elements exist
                if (Object.keys(this.writeQueue[filename]) > 0){
                    this.writeQueue[filename].timeout = this.writeWrapper(this.write, [filename], this.backendOptions.delay);
                }
            });
        });

        // Unlock filename
        this.writeQueue[filename].locked = false;
    }

    // Adds requests to the queue to update files
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
            obj.timeout = this.writeWrapper(this.write, [filename], this.backendOptions.delay);
            this.writeQueue[filename] = obj;
        } else if (!this.writeQueue[filename].locked) {
            obj = this.writeQueue[filename];
            obj.updates.push({
                key,
                fallbackValue,
                callback
            });

            // re-update timeout
            obj.timeout = this.writeWrapper(this.write, [filename], this.backendOptions.delay);
            this.writeQueue[filename] = obj;
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

    requestFileWrite(filename, data, callbacks, onCompleteCallback = null){
        const {
            ipcRenderer
        } = this.backendOptions;

        // Save the callback for this request so we
        // can execute once the ipcRender process returns
        // with a value from the ipcMain process
        for (let i = 0; i < callbacks.length; i++){
            var key = `${UUID.generate()}`;
            this.writeCallbacks[key] = {
                callback: callbacks[i]
            };
    
            // Send out the message to the ipcMain process
            ipcRenderer.send(writeChannel, {
                key,
                filename,
                data
            });
        }

        if (onCompleteCallback !== null){
            onCompleteCallback();
        }
    }

    requestFileRead(filename, callback) {
        const {
            ipcRenderer
        } = this.backendOptions;

        // Save the callback for this request so we
        // can execute once the ipcRender process returns
        // with a value from the ipcMain process
        let key = `${UUID.generate()}`;
        this.readCallbacks[key] = {
            callback: callback
        };

        // Send out the message to the ipcMain process
        ipcRenderer.send(readChannel, {
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

        this.requestFileRead(filename, callback);
    }

    // Not implementing at this time
    readMulti(languages, namespaces, callback) {
        throw "Not implemented exception.";
    }

    // Writes a missing translation to file
    create(languages, namespace, key, fallbackValue, callback) {
        const {
            loadPath
        } = this.backendOptions;
        let filename;
        languages = typeof languages === "string" ? [languages] : languages;

        for (let i = 0; i < languages.length; i++) {
            filename = this.services.interpolator.interpolate(loadPath, {
                lng: languages[i],
                ns: namespace
            });

            this.addToWriteQueue(filename, key, fallbackValue, callback);
        }
    }
}