import electronUpdater from "electron-updater";
import type { UpdateChannel } from "../shared/updates.ts";
import type { UpdateSource } from "./updates.ts";

/**
 * Updates from the GitHub Releases `electron-updater` reads from the app's `app-update.yml`. A downloaded update is
 * installed by `autoInstallOnAppQuit` once the app quits; `quitAndInstall` is never called, so an update never
 * skips the quit question or stops sessions unasked (mattpocock-ade/41).
 */
export function createElectronUpdateSource(): UpdateSource {
  // Read lazily: the autoUpdater of an app that is not packaged has no feed to read.
  const updater = () => electronUpdater.autoUpdater;
  let listening = false;
  return {
    async check(channel: UpdateChannel) {
      const autoUpdater = updater();
      // A failure also rejects the call that hit it, which the updater reports; an `error` event nobody listens to
      // would throw in the main process instead.
      if (!listening) autoUpdater.on("error", () => {});
      listening = true;
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.allowDowngrade = false;
      // `beta` also considers GitHub pre-releases; `latest` only the stable ones.
      autoUpdater.allowPrerelease = channel === "beta";
      const result = await autoUpdater.checkForUpdates();
      return result?.isUpdateAvailable ? { version: result.updateInfo.version } : null;
    },
    async download() {
      await updater().downloadUpdate();
    },
  };
}
