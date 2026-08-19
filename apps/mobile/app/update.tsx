import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { COLORS } from "@crowdshield/config";
import { useApp } from "../src/state/AppProvider";
import {
  checkForUpdate,
  downloadAndInstall,
  formatBytes,
  installedVersion,
  type DownloadProgress,
  type UpdateCheck,
} from "../src/services/updater";
import { RADIUS, s, t, tint } from "../src/theme";
import { Badge, Banner, Button, Card, Label, Screen, Spinner } from "../src/ui";

/**
 * Update from GitHub Releases.
 *
 * Shows what version is installed, what is published, and the release notes
 * before anything is downloaded — an update that silently replaces the app people
 * are relying on at an event is not something to do without asking.
 */
export default function UpdateScreen() {
  const { t: tr } = useApp();
  const [check, setCheck] = useState<UpdateCheck | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setCheck(null);
    setError(null);
    setCheck(await checkForUpdate());
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const install = async () => {
    if (!check || check.state !== "available") return;
    setInstalling(true);
    setError(null);
    try {
      await downloadAndInstall(check.release, setProgress);
      // The installer is now in front of the user; this screen has done its job.
    } catch (cause) {
      setError((cause as Error)?.message ?? "Download failed.");
    } finally {
      setInstalling(false);
      setProgress(null);
    }
  };

  if (!check) {
    return (
      <Screen scroll={false}>
        <Spinner label={tr("updateChecking")} />
      </Screen>
    );
  }

  const fraction = progress?.fraction ?? null;

  return (
    <Screen
      footer={
        check.state === "available" ? (
          <>
            <Button
              label={installing ? tr("updateDownloading") : tr("updateDownload")}
              onPress={install}
              loading={installing}
            />
            <Button label={tr("updateLater")} variant="ghost" onPress={() => router.back()} />
          </>
        ) : (
          <Button label={tr("gotIt")} variant="ghost" onPress={() => router.back()} />
        )
      }
    >
      <View style={{ height: 10 }} />
      <View style={s.between}>
        <Text style={t.h1}>
          {check.state === "available" ? tr("updateAvailable") : tr("updateCurrent")}
        </Text>
        {check.state === "available" ? <Badge tone={COLORS.cyanLight}>NEW</Badge> : null}
      </View>

      <Card style={[s.cardTight, { marginTop: 12 }]}>
        <View style={s.between}>
          <View>
            <Label>{tr("updateInstalled")}</Label>
            <Text style={[t.h3, { marginTop: 2 }]}>v{installedVersion()}</Text>
          </View>
          {check.state === "available" || check.state === "no-apk" ? (
            <View>
              <Label>{tr("updateNewVersion")}</Label>
              <Text style={[t.h3, { marginTop: 2, color: COLORS.cyanLight }]}>
                v{check.release.version}
              </Text>
            </View>
          ) : null}
        </View>
      </Card>

      {/* Download progress */}
      {installing ? (
        <View style={{ marginTop: 12, gap: 6 }}>
          <View
            style={{
              height: 8,
              borderRadius: RADIUS.pill,
              backgroundColor: "rgba(255,255,255,0.10)",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: 8,
                width: fraction != null ? `${Math.round(fraction * 100)}%` : "35%",
                backgroundColor: COLORS.cyan,
              }}
            />
          </View>
          <Text style={t.tiny}>
            {fraction != null
              ? `${Math.round(fraction * 100)}% · ${formatBytes(progress?.bytes ?? 0)}`
              : formatBytes(progress?.bytes ?? 0)}
          </Text>
          <Text style={[t.tiny, { lineHeight: 16 }]}>{tr("updateInstallPrompt")}</Text>
        </View>
      ) : null}

      {/* Release notes */}
      {check.state === "available" || check.state === "no-apk" ? (
        <View style={{ marginTop: 14, gap: 6 }}>
          <Label>{tr("updateNotes")}</Label>
          <Card style={s.cardTight}>
            <Text style={[t.body, { lineHeight: 19 }]}>
              {check.release.notes || check.release.name}
            </Text>
            {check.release.apkSizeBytes ? (
              <Text style={t.tiny}>{formatBytes(check.release.apkSizeBytes)}</Text>
            ) : null}
          </Card>
        </View>
      ) : null}

      {check.state === "no-apk" ? (
        <View style={{ marginTop: 12 }}>
          <Banner tone={COLORS.warning}>
            <Text style={[t.body, { color: "#fde68a" }]}>{tr("updateNoApk")}</Text>
          </Banner>
        </View>
      ) : null}

      {check.state === "unsupported" ? (
        <View style={{ marginTop: 12 }}>
          <Banner tone={tint(COLORS.textMuted, 1)}>
            <Text style={t.body}>
              Self-update is available on Android builds installed outside the Play Store.
            </Text>
          </Banner>
        </View>
      ) : null}

      {check.state === "error" ? (
        <View style={{ marginTop: 12 }}>
          <Banner tone={COLORS.warning}>
            <Text style={[t.body, { color: "#fde68a" }]}>{check.message}</Text>
          </Banner>
        </View>
      ) : null}

      {error ? (
        <Text style={[t.body, { color: "#fca5a5", marginTop: 12 }]}>{error}</Text>
      ) : null}
    </Screen>
  );
}
