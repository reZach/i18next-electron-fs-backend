import { BackendModule, TFunction } from "i18next";
import {
    readFileRequest,
    writeFileRequest,
    readFileResponse,
    writeFileResponse,
} from './src/index.js'

export type ReadFileRequest = typeof readFileRequest;
export type WriteFileRequest = typeof writeFileRequest;
export type ReadFileResponse = typeof readFileResponse;
export type WriteFileResponse = typeof writeFileResponse;

export interface PreloadBindings {
    send: (channel: ReadFileRequest | WriteFileRequest, data?: any) => void;
    onReceive: (channel: ReadFileResponse | WriteFileResponse, func: (data?: any) => void) => void;
    onLanguageChange: (cb: (args: { lng: string }, t: TFunction) => void) => void;
    clientOptions: {
        environment: string | undefined;
        platform: string;
        resourcesPath: string;
    }
}

export function mainBindings(ipcMain: Electron.IpcMain, browserWindow: Electron.BrowserWindow, fs: any): any;
export function clearMainBindings(ipcMain: Electron.IpcMain): any;
export function preloadBindings(ipcRenderer: Electron.IpcRenderer, process: NodeJS.Process): PreloadBindings;

export default {} as BackendModule;
