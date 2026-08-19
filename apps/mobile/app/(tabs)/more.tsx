import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { LANGUAGE_META } from "@crowdshield/config";
import { getApiBaseUrl } from "../../src/api";
import { useApp } from "../../src/state/AppProvider";
import { installedVersion } from "../../src/services/updater";
import { COLORS, s, t } from "../../src/theme";
import { Card, Label, ListRow, Screen, Toggle } from "../../src/ui";

/**
 * Settings and the data promise, restated in plain words.
 *
 * Sharing can be switched off here in one tap. Consent that cannot be withdrawn
 * is not consent, so this screen is part of the privacy design rather than an
 * afterthought.
 */
export default function MoreScreen() {
  const { t: tr, user, lang, event, sharing, startSharing, stopSharing, signOut, selectEvent } = useApp();

  const languageName = LANGUAGE_META.find((meta) => meta.code === lang)?.native ?? lang;

  const toggleSharing = () => {
    if (sharing) stopSharing();
    else void startSharing();
  };

  return (
    <Screen>
      <View style={{ paddingTop: 8, paddingBottom: 6 }}>
        <Text style={t.h1}>{tr("moreTitle")}</Text>
      </View>

      {/* Sharing — the one switch that matters most. */}
      <Card style={s.cardTight}>
        <View style={s.between}>
          <View style={s.grow}>
            <Text style={t.h3}>{tr("sharingLocation")}</Text>
            <Text style={t.tiny}>{tr("sharingSub")}</Text>
          </View>
          {/* Pressable, not onTouchEnd on a View: a raw touch handler fires on any
              touch-up including the end of a scroll gesture, so the sharing switch
              could flip while someone was just scrolling the page. */}
          <Pressable onPress={toggleSharing} hitSlop={10} accessibilityRole="switch">
            <Toggle on={sharing} />
          </Pressable>
        </View>
        <View style={s.divider} />
        <Text style={[t.tiny, { lineHeight: 16 }]}>{tr("sharingOffNote")}</Text>
      </Card>

      {/* Kept in the first screenful, directly under the sharing switch. This was
          previously the very last row of a long scrolling page and was reported
          as missing entirely — a control nobody can find is a control that isn't
          there. Sharing stays first because it is the privacy promise. */}
      <ListRow
        icon={<Ionicons name="log-out-outline" size={15} color="#fca5a5" />}
        title={tr("signOut")}
        subtitle={user ? `${user.name} · ${user.role}` : undefined}
        danger
        onPress={() => {
          void signOut();
          router.replace("/login");
        }}
      />

      <Label>{tr("preferences")}</Label>
      <ListRow
        icon={<Ionicons name="globe-outline" size={15} color={COLORS.cyanLight} />}
        title={tr("language")}
        subtitle={languageName}
        right={<Text style={t.tiny}>›</Text>}
        onPress={() => router.push("/language")}
      />
      {/* A status, not a control. This used to be a Toggle stuck permanently on
          with no handler, which implied a notification setting (and background
          push) that did not exist. Alerts surface live in-app while it is open;
          the check states that honestly rather than faking a switch. */}
      <ListRow
        icon={<Ionicons name="notifications-outline" size={15} color={COLORS.cyanLight} />}
        title={tr("alerts")}
        subtitle={tr("alertsSub")}
        right={<Ionicons name="checkmark-circle" size={18} color={COLORS.success} />}
      />
      <ListRow
        icon={<Ionicons name="ticket-outline" size={15} color={COLORS.cyanLight} />}
        title={tr("changeEvent")}
        subtitle={event?.name ?? ""}
        right={<Text style={t.tiny}>›</Text>}
        onPress={() => {
          selectEvent(null);
          router.replace("/events");
        }}
      />

      <Label>{tr("yourData")}</Label>
      <Card style={s.cardTight}>
        <View style={s.row}>
          <Ionicons name="lock-closed-outline" size={16} color={COLORS.cyanLight} />
          <Text style={[t.h3, s.grow]}>{tr("whatWeCollect")}</Text>
        </View>
        <Text style={[t.tiny, { lineHeight: 16 }]}>{tr("whatWeCollectSub")}</Text>
        <View style={s.divider} />
        <Text style={[t.tiny, { lineHeight: 16 }]}>{tr("b2")}</Text>
      </Card>

      <Label>Connection</Label>
      <ListRow
        icon={<Ionicons name="server-outline" size={15} color={COLORS.cyanLight} />}
        title="Server address"
        subtitle={getApiBaseUrl()}
        right={<Text style={t.tiny}>›</Text>}
        onPress={() => router.push("/server")}
      />

      <Label>{tr("appVersion")}</Label>
      <ListRow
        icon={<Ionicons name="cloud-download-outline" size={15} color={COLORS.cyanLight} />}
        title={tr("checkUpdate")}
        subtitle={`v${installedVersion()}`}
        right={<Text style={t.tiny}>›</Text>}
        onPress={() => router.push("/update")}
      />

      <Text style={[t.tiny, { lineHeight: 16, marginTop: 6 }]}>{tr("footerNote")}</Text>
    </Screen>
  );
}
