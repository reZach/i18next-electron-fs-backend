const defaultOptions = {
    loadPath: "/locales/{{lng}}/{{ns}}.json", // Where the translation files get loaded from
    addPath: "/locales/{{lng}}/{{ns}}.missing.json" // Where the missing translation files get generated
};

// Reads a given .json file
let _readFile = function (fs, filename, callback) {
    fs.readFile(filename, "utf8", (error, data) => {
        if (error) {
            callback(error);
        } else {
            let result;
            data = data.replace(/^\uFEFF/, "");
            try {
                result = JSON.parse(data);
            } catch (parseError) {
                parseError.message = `Error parsing '${filename}'. Message: '${parseError}'.`;
                callback(parseError);
            }
            callback(null, result);
        }
    });
};

// Writes to the translation .json files
let _writeFile = function (fs, filename, data, callback) {
    fs.writeFile(filename, JSON.stringify(data), (error) => {
        callback(error);
    });
    callback(null, "success");
}

class Queue {
    add() {

    }

    remove() {

    }
}
class WriteManager {
    constructor(fs, delay = 300) {
        this.fs = fs;
        this.delay = delay;
        this.timeouts = {};
        this.timeoutsBuffer = {};
    }

    add(filename, key, fallbackValue, callback) {

        if (typeof this.timeouts[filename] === "undefined") {
            this.timeouts[filename] = {
                timeout: setTimeout(write, this.delay),
                updates: [{
                    key,
                    fallbackValue,
                    callback
                }],
                locked: false
            };
        } else if (!this.timeouts[filename].locked) {
            this.timeouts[filename].timeout = setTimeout(write, this.delay);
            this.timeouts[filename].updates.push({
                key,
                fallbackValue,
                callback
            });
        } else {
            if (typeof this.timeoutsBuffer[filename] === "undefined"){
                this.timeoutsBuffer[filename] = {
                    updates: [{
                        key,
                        fallbackValue,
                        callback
                    }]
                };
            } else {
                this.timeoutsBuffer[filename].updates.push({
                    updates: [{
                        key,
                        fallbackValue,
                        callback
                    }]
                });
            }
        }
    }

    write() {

    }
}

// Template is found at: https://www.i18next.com/misc/creating-own-plugins#backend;
// also took code from: https://github.com/i18next/i18next-node-fs-backend
class Backend {
    constructor(services, backendOptions = {}, i18nextOptions = {}) {
        // Load fs from the window (contextBridge) instead of from Node;
        // https://electronjs.org/docs/api/context-bridge#contextbridgeexposeinmainworldapikey-api-experimental
        if (typeof this.backendOptions.fs === "undefined") {
            throw "Could not initialize because the 'fs' option was not set!";
        }

        this.init(services, backendOptions, i18nextOptions);
        this.writeManager = new WriteManager(this.backendOptions.fs);
    }

    init(services, backendOptions, i18nextOptions) {
        this.services = services;
        this.backendOptions = {
            ...defaultOptions,
            ...backendOptions
        };
        this.i18nextOptions = i18nextOptions;
    }

    // Reads a given translation file
    read(language, namespace, callback) {
        const {
            loadPath,
            fs
        } = this.backendOptions;
        let filename = this.services.interpolator.interpolate(loadPath, {
            lng: language,
            ns: namespace
        });

        _readFile(fs, filename, callback);
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
        let iterateLanguages = typeof languages === "string" ? [languages] : languages;

        for (let i = 0; i < iterateLanguages.length; i++) {
            filename = this.services.interpolator.interpolate(loadPath, {
                lng: iterateLanguages[i],
                ns: namespace
            });
            this.writeManager.add(filename, key, fallbackValue, callback);
        }
    }
}