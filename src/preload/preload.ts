import { contextBridge, ipcRenderer } from "electron";
import type { AppState } from "../shared/model.js";

const api = {
  getState: (): Promise<AppState> => ipcRenderer.invoke("state:get"),
  onState: (cb: (state: AppState) => void): void => {
    ipcRenderer.on("state", (_e, state: AppState) => cb(state));
  },
  setMetrics: (top: number, panel: number): void => ipcRenderer.send("chrome:metrics", { top, panel }),
  newMainTab: (): Promise<number> => ipcRenderer.invoke("tab:new-main"),
  activateTab: (id: number): Promise<void> => ipcRenderer.invoke("tab:activate", id),
  closeTab: (id: number): Promise<void> => ipcRenderer.invoke("tab:close", id),
  navigate: (id: number, input: string): Promise<void> => ipcRenderer.invoke("tab:navigate", id, input),
  back: (id: number): Promise<void> => ipcRenderer.invoke("tab:back", id),
  forward: (id: number): Promise<void> => ipcRenderer.invoke("tab:forward", id),
  reload: (id: number): Promise<void> => ipcRenderer.invoke("tab:reload", id),
  openSession: (id: string): Promise<void> => ipcRenderer.invoke("session:open", id),
  createEmpty: (url: string, name: string): Promise<string> => ipcRenderer.invoke("session:create-empty", url, name),
  createFromTab: (tabId: number, name: string): Promise<string> =>
    ipcRenderer.invoke("session:create-from-tab", tabId, name),
  updateSession: (id: string, patch: { name?: string; color?: string }): Promise<void> =>
    ipcRenderer.invoke("session:update", id, patch),
  deleteSession: (id: string): Promise<void> => ipcRenderer.invoke("session:delete", id),
};

export type XobApi = typeof api;

contextBridge.exposeInMainWorld("xob", api);
