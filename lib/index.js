"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = exports.clearMainBindings = exports.mainBindings = exports.preloadBindings = exports.changeLanguageRequest = exports.writeFileResponse = exports.readFileResponse = exports.writeFileRequest = exports.readFileRequest = void 0;

var _lodash = require("lodash");

var _utils = require("./utils");

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var defaultOptions = {
  debug: false,
  loadPath: "/locales/{{lng}}/{{ns}}.json",
  addPath: "/locales/{{lng}}/{{ns}}.missing.json"
};
var readFileRequest = "ReadFile-Request";
exports.readFileRequest = readFileRequest;
var writeFileRequest = "WriteFile-Request";
exports.writeFileRequest = writeFileRequest;
var readFileResponse = "ReadFile-Response";
exports.readFileResponse = readFileResponse;
var writeFileResponse = "WriteFile-Response";
exports.writeFileResponse = writeFileResponse;
var changeLanguageRequest = "ChangeLanguage-Request";
exports.changeLanguageRequest = changeLanguageRequest;

var preloadBindings = function preloadBindings(ipcRenderer) {
  return {
    send: function send(channel, data) {
      var validChannels = [readFileRequest, writeFileRequest];

      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    onReceive: function onReceive(channel, func) {
      var validChannels = [readFileResponse, writeFileResponse];

      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, function (event, args) {
          return func(args);
        });
      }
    },
    onLanguageChange: function onLanguageChange(func) {
      ipcRenderer.on(changeLanguageRequest, function (event, args) {
        return func(args);
      });
    }
  };
};

exports.preloadBindings = preloadBindings;

var mainBindings = function mainBindings(ipcMain, browserWindow, fs) {
  ipcMain.on(readFileRequest, function (IpcMainEvent, args) {
    var callback = function (error, data) {
      this.webContents.send(readFileResponse, {
        key: args.key,
        error: error,
        data: typeof data !== "undefined" && data !== null ? data.toString() : ""
      });
    }.bind(browserWindow);

    fs.readFile(args.filename, callback);
  });
  ipcMain.on(writeFileRequest, function (IpcMainEvent, args) {
    var callback = function (error) {
      this.webContents.send(writeFileResponse, {
        keys: args.keys,
        error: error
      });
    }.bind(browserWindow);

    var separator = "/";
    var windowsSeparator = "\\";
    if (args.filename.includes(windowsSeparator)) separator = windowsSeparator;
    var root = args.filename.slice(0, args.filename.lastIndexOf(separator));
    fs.mkdir(root, {
      recursive: true
    }, function (error) {
      fs.writeFile(args.filename, JSON.stringify(args.data), callback);
    });
  });
};

exports.mainBindings = mainBindings;

var clearMainBindings = function clearMainBindings(ipcMain) {
  ipcMain.removeAllListeners(readFileRequest);
  ipcMain.removeAllListeners(writeFileRequest);
};

exports.clearMainBindings = clearMainBindings;

var Backend = function () {
  function Backend(services) {
    var backendOptions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    var i18nextOptions = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    _classCallCheck(this, Backend);

    this.init(services, backendOptions, i18nextOptions);
    this.readCallbacks = {};
    this.writeCallbacks = {};
    this.writeTimeout;
    this.writeQueue = [];
    this.writeQueueOverflow = [];
    this.useOverflow = false;
  }

  _createClass(Backend, [{
    key: "init",
    value: function init(services, backendOptions, i18nextOptions) {
      if (typeof window !== "undefined" && typeof window.api.i18nextElectronBackend === "undefined") {
        throw "'window.api.i18nextElectronBackend' is not defined! Be sure you are setting up your BrowserWindow's preload script properly!";
      }

      this.services = services;
      this.backendOptions = _objectSpread({}, defaultOptions, {}, backendOptions, {
        i18nextElectronBackend: typeof window !== "undefined" ? window.api.i18nextElectronBackend : undefined
      });
      this.i18nextOptions = i18nextOptions;

      if (typeof this.backendOptions.i18nextElectronBackend === "undefined") {
        this.fs = require("fs").default;
      }

      var logPrepend = "[i18next-electron-fs-backend:";
      this.mainLog = "".concat(logPrepend, "main]=>");
      this.rendererLog = "".concat(logPrepend, "renderer]=>");
      this.setupIpcBindings();
    }
  }, {
    key: "setupIpcBindings",
    value: function setupIpcBindings() {
      var _this = this;

      var i18nextElectronBackend = this.backendOptions.i18nextElectronBackend;

      if (typeof i18nextElectronBackend === "undefined") {
        return;
      }

      i18nextElectronBackend.onReceive(readFileResponse, function (args) {
        if (typeof _this.readCallbacks[args.key] === "undefined") return;
        var callback;

        if (args.error) {
          callback = _this.readCallbacks[args.key].callback;
          delete _this.readCallbacks[args.key];
          if (callback !== null && typeof callback === "function") callback(null, {});
        } else {
          var result;
          args.data = args.data.replace(/^\uFEFF/, "");

          try {
            result = JSON.parse(args.data);
          } catch (parseError) {
            parseError.message = "Error parsing '".concat(args.filename, "'. Message: '").concat(parseError, "'.");
            callback = _this.readCallbacks[args.key].callback;
            delete _this.readCallbacks[args.key];
            if (callback !== null && typeof callback === "function") callback(parseError);
            return;
          }

          callback = _this.readCallbacks[args.key].callback;
          delete _this.readCallbacks[args.key];
          if (callback !== null && typeof callback === "function") callback(null, result);
        }
      });
      i18nextElectronBackend.onReceive(writeFileResponse, function (args) {
        var keys = args.keys;

        for (var i = 0; i < keys.length; i++) {
          var callback = void 0;
          if (typeof _this.writeCallbacks[keys[i]] === "undefined") return;

          if (args.error) {
            callback = _this.writeCallbacks[keys[i]].callback;
            delete _this.writeCallbacks[keys[i]];
            callback(args.error);
          } else {
            callback = _this.writeCallbacks[keys[i]].callback;
            delete _this.writeCallbacks[keys[i]];
            callback(null, true);
          }
        }
      });
    }
  }, {
    key: "write",
    value: function write(writeQueue) {
      var _this2 = this;

      var _this$backendOptions = this.backendOptions,
          debug = _this$backendOptions.debug,
          i18nextElectronBackend = _this$backendOptions.i18nextElectronBackend;
      var toWork = (0, _utils.groupByArray)(writeQueue, "filename");

      if (typeof i18nextElectronBackend !== "undefined") {
        var _loop = function _loop(i) {
          anonymous = function (error, data) {
            if (error) {
              console.error("".concat(this.rendererLog, " encountered error when trying to read file '").concat(filename, "' before writing missing translation ('").concat(key, "'/'").concat(fallbackValue, "') to file. Please resolve this error so missing translation values can be written to file. Error: '").concat(error, "'."));
              return;
            }

            var keySeparator = !!this.i18nextOptions.keySeparator;
            var writeKeys = [];

            for (var j = 0; j < toWork[i].values.length; j++) {
              if (!keySeparator) {
                data[toWork[i].values[j].key] = toWork[i].values[j].fallbackValue;
              } else {
                data = (0, _utils.mergeNested)(data, toWork[i].values[j].key, this.i18nextOptions.keySeparator, toWork[i].values[j].fallbackValue);
              }

              var writeKey = "".concat(_utils.UUID.generate());

              if (toWork[i].values[j].callback) {
                this.writeCallbacks[writeKey] = {
                  callback: toWork[i].values[j].callback
                };
                writeKeys.push(writeKey);
              }
            }

            debug ? console.log("".concat(this.rendererLog, " requesting the missing key '").concat(key, "' be written to file '").concat(filename, "'.")) : null;
            i18nextElectronBackend.send(writeFileRequest, {
              keys: writeKeys,
              filename: toWork[i].key,
              data: data
            });
          }.bind(_this2);

          _this2.requestFileRead(toWork[i].key, anonymous);
        };

        for (var i = 0; i < toWork.length; i++) {
          var anonymous;

          _loop(i);
        }
      } else {
        var _loop2 = function _loop2(_i) {
          fs.readFile(toWork[_i].key, function (error, data) {
            if (error) {
              console.error("".concat(_this2.rendererLog, " encountered error when trying to read file '").concat(filename, "' before writing missing translation ('").concat(key, "'/'").concat(fallbackValue, "') to file. Please resolve this error so missing translation values can be written to file. Error: '").concat(error, "'."));
              return;
            }

            var keySeparator = !!_this2.i18nextOptions.keySeparator;
            var writeCallbacks = [];

            for (var j = 0; j < toWork[_i].values.length; j++) {
              if (!keySeparator) {
                data[toWork[_i].values[j].key] = toWork[_i].values[j].fallbackValue;
              } else {
                data = (0, _utils.mergeNested)(data, toWork[_i].values[j].key, _this2.i18nextOptions.keySeparator, toWork[_i].values[j].fallbackValue);
              }

              if (toWork[_i].values[j].callback) {
                writeCallbacks.push(toWork[_i].values[j].callback);
              }
            }

            debug ? console.log("".concat(_this2.rendererLog, " requesting the missing key '").concat(key, "' be written to file '").concat(filename, "'.")) : null;
            var separator = "/";
            var windowsSeparator = "\\";
            if (toWork[_i].key.includes(windowsSeparator)) separator = windowsSeparator;

            var root = toWork[_i].key.slice(0, toWork[_i].key.lastIndexOf(separator));

            _this2.fs.mkdir(root, {
              recursive: true
            }, function (error) {
              fs.writeFile(toWork[_i].key, JSON.stringify(data), function (error) {
                if (error) {
                  for (var k = 0; k < writeCallbacks.length; k++) {
                    writeCallbacks[k](error, false);
                  }
                } else {
                  for (var _k = 0; _k < writeCallbacks.length; _k++) {
                    writeCallbacks[_k](null, true);
                  }
                }
              });
            });
          });
        };

        for (var _i = 0; _i < toWork.length; _i++) {
          _loop2(_i);
        }
      }
    }
  }, {
    key: "requestFileRead",
    value: function requestFileRead(filename, callback) {
      var i18nextElectronBackend = this.backendOptions.i18nextElectronBackend;
      var key = "".concat(_utils.UUID.generate());
      this.readCallbacks[key] = {
        callback: callback
      };
      i18nextElectronBackend.send(readFileRequest, {
        key: key,
        filename: filename
      });
    }
  }, {
    key: "read",
    value: function read(language, namespace, callback) {
      var _this$backendOptions2 = this.backendOptions,
          loadPath = _this$backendOptions2.loadPath,
          i18nextElectronBackend = _this$backendOptions2.i18nextElectronBackend;
      var filename = this.services.interpolator.interpolate(loadPath, {
        lng: language,
        ns: namespace
      });

      if (typeof i18nextElectronBackend !== "undefined") {
        this.requestFileRead(filename, function (error, data) {
          if (error) return callback(error, false);
          callback(null, data);
        });
      } else {
        this.fs.readFile(filename, function (error, data) {
          if (error) return callback(error, false);
          callback(null, data);
        });
      }
    }
  }, {
    key: "readMulti",
    value: function readMulti(languages, namespaces, callback) {
      throw "Not implemented exception.";
    }
  }, {
    key: "create",
    value: function create(languages, namespace, key, fallbackValue, callback) {
      var addPath = this.backendOptions.addPath;
      var filename;
      languages = typeof languages === "string" ? [languages] : languages;

      for (var i = 0; i < languages.length; i++) {
        filename = this.services.interpolator.interpolate(addPath, {
          lng: languages[i],
          ns: namespace
        });

        if (this.useOverflow) {
          this.writeQueueOverflow.push({
            filename: filename,
            key: key,
            fallbackValue: fallbackValue,
            callback: callback
          });
        } else {
          this.writeQueue.push({
            filename: filename,
            key: key,
            fallbackValue: fallbackValue,
            callback: callback
          });
        }
      }

      if (this.writeQueue.length > 0 && !this.useOverflow) {
        if (typeof this.writeTimeout !== "undefined") {
          clearInterval(this.writeTimeout);
        }

        this.writeTimeout = setInterval(function () {
          if (this.writeQueue.length > 0) {
            this.write((0, _lodash.cloneDeep)(this.writeQueue));
          }

          this.writeQueue = (0, _lodash.cloneDeep)(this.writeQueueOverflow);
          this.writeQueueOverflow = [];

          if (this.writeQueue.length === 0) {
            clearInterval(this.writeTimeout);
            delete this.writeTimeout;
            this.useOverflow = false;
          }
        }.bind(this), 1000);
        this.useOverflow = true;
      }
    }
  }]);

  return Backend;
}();

Backend.type = "backend";
var _default = Backend;
exports["default"] = _default;