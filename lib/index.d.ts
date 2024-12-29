export const readFileRequest: "ReadFile-Request";
export const writeFileRequest: "WriteFile-Request";
export const readFileResponse: "ReadFile-Response";
export const writeFileResponse: "WriteFile-Response";
export const changeLanguageRequest: "ChangeLanguage-Request";
export function preloadBindings(ipcRenderer: any, process: any): {
    send: (channel: any, data: any) => void;
    onReceive: (channel: any, func: any) => void;
    onLanguageChange: (func: any) => void;
    clientOptions: {
        environment: any;
        platform: any;
        resourcesPath: any;
    };
};
export function mainBindings(ipcMain: any, browserWindow: any, fs: any): void;
export function clearMainBindings(ipcMain: any): void;
export default Backend;
declare class Backend {
    constructor(services: any, backendOptions?: {}, i18nextOptions?: {});
    readCallbacks: {};
    writeCallbacks: {};
    writeTimeout: any;
    writeQueue: any[];
    writeQueueOverflow: any[];
    useOverflow: boolean;
    init(services: any, backendOptions: any, i18nextOptions: any): void;
    services: any;
    backendOptions: any;
    i18nextOptions: any;
    mainLog: string;
    rendererLog: string;
    setupIpcBindings(): void;
    write(writeQueue: any): void;
    requestFileRead(filename: any, callback: any): void;
    read(language: any, namespace: any, callback: any): void;
    readMulti(_languages: any, _namespaces: any, _callback: any): void;
    create(languages: any, namespace: any, key: any, fallbackValue: any, callback: any): void;
}
declare namespace Backend {
    let type: string;
}
