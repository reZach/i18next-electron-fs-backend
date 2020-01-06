const defaultOptions = {
    loadPath: "/locales/{{lng}}/{{ns}}.json", // Where the translation files get loaded from
    addPath: "/locales/{{lng}}/{{ns}}.missing.json", // Where the missing translation files get generated
    delay: 300
};
// Electron-specific; must match mainIpc
const readChannel = "ReadFile";
const writeChannel = "WriteChannel";

/**
 * Fast UUID generator, RFC4122 version 4 compliant.
 * @author Jeff Ward (jcward.com).
 * @license MIT license
 * @link http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136
 **/
var UUID = (function () {
    var self = {};
    var lut = [];
    for (var i = 0; i < 256; i++) {
        lut[i] = (i < 16 ? '0' : '') + (i).toString(16);
    }
    self.generate = function () {
        var d0 = Math.random() * 0xffffffff | 0;
        var d1 = Math.random() * 0xffffffff | 0;
        var d2 = Math.random() * 0xffffffff | 0;
        var d3 = Math.random() * 0xffffffff | 0;
        return lut[d0 & 0xff] + lut[d0 >> 8 & 0xff] + lut[d0 >> 16 & 0xff] + lut[d0 >> 24 & 0xff] + '-' +
            lut[d1 & 0xff] + lut[d1 >> 8 & 0xff] + '-' + lut[d1 >> 16 & 0x0f | 0x40] + lut[d1 >> 24 & 0xff] + '-' +
            lut[d2 & 0x3f | 0x80] + lut[d2 >> 8 & 0xff] + '-' + lut[d2 >> 16 & 0xff] + lut[d2 >> 24 & 0xff] +
            lut[d3 & 0xff] + lut[d3 >> 8 & 0xff] + lut[d3 >> 16 & 0xff] + lut[d3 >> 24 & 0xff];
    }
    return self;
})();



// Writes to the translation .json files
let _writeFile = function (fs, filename, data, callback) {
    fs.writeFile(filename, JSON.stringify(data), (error) => {
        callback(error);
    });
    callback(null, "success");
}

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

        this.writeManager = new WriteManager(this.backendOptions.ipcRenderer);
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
                callback = this.readCallbacks[key].callback;
                delete this.readCallbacks[key];
                callback(error);
            } else {
                let result;
                args.data = data.replace(/^\uFEFF/, "");
                try {
                    result = JSON.parse(args.data);
                } catch (parseError) {
                    parseError.message = `Error parsing '${filename}'. Message: '${parseError}'.`;
                    callback = this.readCallbacks[key].callback;
                    delete this.readCallbacks[key];
                    this.readCallbacks[key].callback(parseError);
                }
                callback = this.readCallbacks[key].callback;
                delete this.readCallbacks[key];
                this.readCallbacks[key].callback(null, result);
            }
        });
    }

    writeWrapper(func, args, delay) {
        setTimeout(func.apply(null, args), delay);
    }

    write(updates, filename) {
        // Lock filename
        this.writeQueue[filename].locked = true;

        requestFileRead(filename, (error, data) => {
            if (error) throw "err!";


        });

        // Unlock filename
        this.writeQueue[filename].locked = false;
    }

    addToWriteQueue(filename, key, fallbackValue, callback) {
        let obj; // holds properties for the queue
        let writeArgs; // holds func args for the .write method

        if (typeof this.writeQueue[filename] === "undefined") {
            obj = {
                updates: [{
                    key,
                    fallbackValue,
                    callback
                }],
                locked: false
            };
            writeArgs = [obj.updates, filename];

            // re-update timeout
            obj.timeout = this.writeWrapper(write, writeArgs, this.delay);
            this.writeQueue[filename] = obj;
        } else if (!this.writeQueue[filename].locked) {
            obj = this.writeQueue[filename];
            obj.updates.push({
                key,
                fallbackValue,
                callback
            });
            writeArgs = [obj.updates, filename];

            // re-update timeout
            obj.timeout = this.writeWrapper(write, writeArgs, this.delay);
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