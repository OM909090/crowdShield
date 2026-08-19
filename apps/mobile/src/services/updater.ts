import * as Application from "expo-application";
/**
 * The legacy file-system API, deliberately.
 *
 * SDK 54 introduced a new `File`/`Directory` API, but `getContentUriAsync` — which
 * is what turns a downloaded file into something Android's package installer is
 * allowed to read — only exists on the legacy surface. A file:// URI throws
 * FileUriExposedException on Android 7+, so there is no way to ship this feature
 * without it.
 */
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { Platform } from "react-native";

/**
 * Self-update from GitHub Releases.
 *
 * This app is distributed as an APK (a pilot deployment at an event, not a Play
 * Store listing), so there is no store to push updates through. Instead it asks
 * GitHub for the latest release, compares versions, downloads the attached APK
 * and hands it to Android's package installer.
 *
 * Three things worth knowing before relying on this:
 *
 *  1. It only works for APK builds installed outside the Play Store. Google Play
 *     policy forbids an app updating itself, so a Play-distributed build must use
 *     the store (or EAS Update for JS-only changes). `canSelfUpdate` reflects that.
 *  2. Android will ask the user to allow installs from this app the first time
 *     (REQUEST_INSTALL_PACKAGES grants the ability to ask, not the permission).
 *  3. The release must have a `.apk` asset attached. A tag alone is not enough,
 *     which is why `NoApkError` is a distinct outcome rather than a generic failure.
 */

export interface ReleaseInfo {
  /** Tag as published, e.g. `v1.2.0`. */
  readonly tag: string;
  /** Parsed semver, without the leading `v`. */
  readonly version: string;
  readonly name: string;
  /** Markdown release notes, shown to the user before they commit to a download. */
  readonly notes: string;
  readonly publishedAt: string;
  readonly apkUrl: string | null;
  readonly apkSizeBytes: number | null;
}

export type UpdateCheck =
  | { readonly state: "current"; readonly installed: string }
  | { readonly state: "available"; readonly installed: string; readonly release: ReleaseInfo }
  | { readonly state: "no-apk"; readonly installed: string; readonly release: ReleaseInfo }
  | { readonly state: "unsupported"; readonly installed: string }
  | { readonly state: "error"; readonly installed: string; readonly message: string };

/** `owner/repo`, from app config. Without it, update checking is simply off. */
const REPO = process.env.EXPO_PUBLIC_UPDATE_REPO?.trim() ?? "";

/** The version Android reports for the installed package. */
export const installedVersion = (): string =>
  Application.nativeApplicationVersion ?? "0.0.0";

/**
 * Self-updating only makes sense for a sideloaded Android build. On iOS it is
 * impossible; from the Play Store it is against policy.
 */
export const canSelfUpdate = (): boolean => Platform.OS === "android" && REPO.length > 0;

/**
 * Compare two dotted versions numerically.
 *
 * A string compare gets this wrong in the one case that matters: "1.10.0" sorts
 * before "1.9.0" lexically, so an update would be offered as a downgrade or
 * missed entirely.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, "")
      // Drop any pre-release suffix; `1.2.0-beta.1` compares as `1.2.0`.
      .split("-")[0]!
      .split(".")
      .map((part) => Number.parseInt(part, 10))
      .map((n) => (Number.isFinite(n) ? n : 0));

  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l > r ? 1 : -1;
  }
  return 0;
}

interface GitHubAsset {
  readonly name?: string;
  readonly browser_download_url?: string;
  readonly size?: number;
  readonly content_type?: string;
}

interface GitHubRelease {
  readonly tag_name?: string;
  readonly name?: string;
  readonly body?: string;
  readonly published_at?: string;
  readonly draft?: boolean;
  readonly prerelease?: boolean;
  readonly assets?: readonly GitHubAsset[];
}

function toReleaseInfo(payload: GitHubRelease): ReleaseInfo {
  const tag = payload.tag_name ?? "";
  const apk =
    payload.assets?.find(
      (asset) =>
        asset.name?.toLowerCase().endsWith(".apk") ||
        asset.content_type === "application/vnd.android.package-archive"
    ) ?? null;

  return {
    tag,
    version: tag.replace(/^v/i, ""),
    name: payload.name || tag,
    notes: (payload.body ?? "").trim(),
    publishedAt: payload.published_at ?? "",
    apkUrl: apk?.browser_download_url ?? null,
    apkSizeBytes: apk?.size ?? null,
  };
}

/**
 * Ask GitHub whether there is anything newer.
 *
 * Never throws: a failed update check must not break the app someone is using to
 * find their way out of a crowd. Every outcome is a value the caller can render.
 */
export async function checkForUpdate(signal?: AbortSignal): Promise<UpdateCheck> {
  const installed = installedVersion();
  if (!canSelfUpdate()) return { state: "unsupported", installed };

  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal,
    });

    if (response.status === 404) {
      // No published release yet — not an error, just nothing to install.
      return { state: "current", installed };
    }
    if (!response.ok) {
      return {
        state: "error",
        installed,
        message:
          response.status === 403
            ? "GitHub rate limit reached. Try again in a few minutes."
            : `Update check failed (${response.status}).`,
      };
    }

    const release = toReleaseInfo((await response.json()) as GitHubRelease);
    if (!release.version) return { state: "current", installed };
    if (compareVersions(release.version, installed) <= 0) return { state: "current", installed };
    if (!release.apkUrl) return { state: "no-apk", installed, release };
    return { state: "available", installed, release };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") return { state: "current", installed };
    return { state: "error", installed, message: "Couldn't reach GitHub. Check your connection." };
  }
}

export interface DownloadProgress {
  /** 0..1, or null when the server sent no content length. */
  readonly fraction: number | null;
  readonly bytes: number;
  readonly totalBytes: number | null;
}

/**
 * Download the APK and open Android's installer.
 *
 * The file goes to the app's cache directory and is exposed to the installer via
 * a content:// URI — a file:// URI throws FileUriExposedException on Android 7+,
 * and passing one is the classic way this feature fails on a modern device.
 */
export async function downloadAndInstall(
  release: ReleaseInfo,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  if (Platform.OS !== "android") throw new Error("Self-install is only possible on Android.");
  if (!release.apkUrl) throw new Error("This release has no Android package attached.");

  const target = `${FileSystem.cacheDirectory}crowdshield-${release.version}.apk`;

  // A part-downloaded file from an interrupted attempt would install as corrupt.
  const existing = await FileSystem.getInfoAsync(target);
  if (existing.exists) await FileSystem.deleteAsync(target, { idempotent: true });

  const task = FileSystem.createDownloadResumable(
    release.apkUrl,
    target,
    {},
    (progress) => {
      const total = progress.totalBytesExpectedToWrite;
      onProgress?.({
        bytes: progress.totalBytesWritten,
        totalBytes: total > 0 ? total : null,
        fraction: total > 0 ? progress.totalBytesWritten / total : null,
      });
    }
  );

  const result = await task.downloadAsync();
  if (!result?.uri) throw new Error("Download did not complete.");

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync("android.intent.action.INSTALL_PACKAGE", {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION — the installer must read our file
  });
}

/** Human-readable download size, for the confirm screen. */
export const formatBytes = (bytes: number | null): string => {
  if (bytes == null || !Number.isFinite(bytes)) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
