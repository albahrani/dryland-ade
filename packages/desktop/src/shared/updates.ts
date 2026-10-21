/** Where releases are published; ticket 60 fills in the owner with the publish config. */
export const RELEASES_URL = "https://github.com/dryland-ade/dryland-ade/releases";

/** The release page of `version`, which a notify-only platform links to. */
export const releaseUrl = (version: string): string => `${RELEASES_URL}/tag/v${version}`;

/** `latest` follows stable releases; `beta` also follows GitHub pre-releases. */
export const UPDATE_CHANNELS = ["latest", "beta"] as const;
export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];
export const DEFAULT_UPDATE_CHANNEL: UpdateChannel = "latest";
export const isUpdateChannel = (value: unknown): value is UpdateChannel =>
  UPDATE_CHANNELS.includes(value as UpdateChannel);

/**
 * What the app does with a found update: `auto` downloads it and installs on the next quit; `notify` only says so and
 * links the release; `off` is an app not running from an installer (a dev run, a build from source).
 */
export type UpdateMode = "auto" | "notify" | "off";

/** What decides the mode: Windows NSIS and Linux AppImage update themselves; macOS and deb do not. */
export interface UpdatePlatform {
  platform: NodeJS.Platform;
  /** Whether the app is a packaged build. */
  packaged: boolean;
  /** Whether the app runs from an AppImage, which sets `APPIMAGE`; a deb install does not. */
  appImage: boolean;
}

export function updateMode({ platform, packaged, appImage }: UpdatePlatform): UpdateMode {
  if (!packaged) return "off";
  if (platform === "win32") return "auto";
  if (platform === "linux" && appImage) return "auto";
  return "notify";
}

/** Where the update check and download stand. */
export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date" }
  /** Found, with nothing downloaded: a notify-only platform. */
  | { kind: "available"; version: string; url: string }
  | { kind: "downloading"; version: string }
  /** Downloaded; it installs when the app next quits. */
  | { kind: "ready"; version: string }
  | { kind: "failed"; message: string };

/** What the Updates tab shows. */
export interface UpdateState {
  version: string;
  channel: UpdateChannel;
  mode: UpdateMode;
  /** ISO time of the last check, automatic or not; `null` before the first. */
  lastCheck: string | null;
  status: UpdateStatus;
}
