"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = exports.mainBindings = exports.preloadBindings = exports.changeLanguageRequest = exports.writeFileResponse = exports.readFileResponse = exports.writeFileRequest = exports.readFileRequest = void 0;

var _utils = require("./utils");

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var defaultOptions = {
  loadPath: "/locales/{{lng}}/{{ns}}.json",
  addPath: "/locales/{{lng}}/{{ns}}.missing.json",
  delay: 300
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
        try {
          ipcRenderer.on(channel, function (event, args) {
            try {
              console.log("success");
              console.log(channel);
              return func(args);
            } catch (err) {
              console.error(err);
              console.error(channel);
            }
          });
        } catch (e) {
          console.error(e);
          console.error("failing ipcrenderer.on");
        }
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
        key: args.key,
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

var Backend = function () {
  function Backend(services) {
    var backendOptions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    var i18nextOptions = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    _classCallCheck(this, Backend);

    this.init(services, backendOptions, i18nextOptions);
    this.readCallbacks = {};
    this.writeCallbacks = {};
    this.writeQueue = {};
    this.writeQueueBuffer = {};
  }

  _createClass(Backend, [{
    key: "init",
    value: function init(services, backendOptions, i18nextOptions) {
      if (typeof window.api.i18nextElectronBackend === "undefined") {
        throw "'window.api.i18nextElectronBackend' is not defined! Be sure you are setting up your BrowserWindow's preload script properly!";
      }

      this.services = services;
      this.backendOptions = _objectSpread({}, defaultOptions, {}, backendOptions, {
        i18nextElectronBackend: window.api.i18nextElectronBackend
      });
      this.i18nextOptions = i18nextOptions;
      this.setupIpcBindings();
    }
  }, {
    key: "setupIpcBindings",
    value: function setupIpcBindings() {
      var _this = this;

      var i18nextElectronBackend = this.backendOptions.i18nextElectronBackend;
      i18nextElectronBackend.onReceive(readFileResponse, function (args) {
        debugger;
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
        var callback;
        debugger;
        console.log("writefile callback");
        console.log(typeof _this.writeCallbacks[args.key] === "undefined");
        if (typeof _this.writeCallbacks[args.key] === "undefined") return;

        if (args.error) {
          callback = _this.writeCallbacks[args.key].callback;
          delete _this.writeCallbacks[args.key];
          callback(args.error);
        } else {
          callback = _this.writeCallbacks[args.key].callback;
          delete _this.writeCallbacks[args.key];
          callback(null, true);
        }
      });
    }
  }, {
    key: "write",
    value: function write(filename, key, fallbackValue, callback) {
      var _this2 = this;

      var i18nextElectronBackend = this.backendOptions.i18nextElectronBackend;
      this.requestFileRead(filename, function (error, data) {
        if (error) {}

        var keySeparator = !!_this2.i18nextOptions.keySeparator;

        if (!keySeparator) {
          data[key] = fallbackValue;
        } else {
          data = (0, _utils.mergeNested)(data, key, _this2.i18nextOptions.keySeparator, fallbackValue);
        }

        var key = "".concat(_utils.UUID.generate());

        if (callback) {
          console.warn('callback is true');
          _this2.writeCallbacks[key] = {
            callback: callback
          };
        }

        debugger;
        i18nextElectronBackend.send(writeFileRequest, {
          key: key,
          filename: filename,
          data: data
        });
      });
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
      var loadPath = this.backendOptions.loadPath;
      var filename = this.services.interpolator.interpolate(loadPath, {
        lng: language,
        ns: namespace
      });
      this.requestFileRead(filename, function (error, data) {
        debugger;
        if (error) return callback(error, false);
        callback(null, data);
      });
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
        this.write(filename, key, fallbackValue, callback);
      }
    }
  }]);

  return Backend;
}();

Backend.type = "backend";
var _default = Backend;
exports["default"] = _default;