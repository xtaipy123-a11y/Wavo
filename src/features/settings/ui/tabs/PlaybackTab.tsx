import { useState, useEffect } from "react";
import { useTranslation } from "@/languages";
import { usePlayerStore } from "@/features/player";
import { ToggleSwitch } from "@/shared/ui";
import { SettingRow, SettingSection, SegmentedControl } from "../controls";
import { activeConnect, useConnectStore } from "@/features/cloud/wavoConnect";
import { SmartPlaylistsPanel } from "@/features/cloud/SmartPlaylistsPanel";

export function PlaybackTab({ searchQuery }: { searchQuery?: string }) {
  const { t, locale } = useTranslation();
  const de = locale === "de";
  const devices = useConnectStore((state) => state.devices);
  const selectedDeviceId = useConnectStore((state) => state.selectedDeviceId);
  const localDeviceId = useConnectStore((state) => state.localDeviceId);
  const localAcceptsControl = useConnectStore((state) => state.localAcceptsControl);
  const connectError = useConnectStore((state) => state.error);
  const [connectBusy, setConnectBusy] = useState(false);
  const selectedDevice = devices.find((device) => device.device_id === selectedDeviceId);
  const deviceOnline = (lastSeen: string) => Date.now() - Date.parse(lastSeen) < 45000;
  const connectAction = async (action: () => Promise<void>) => {
    setConnectBusy(true);
    try { await action(); useConnectStore.setState({ error: null }); }
    catch (error) { useConnectStore.setState({ error: error instanceof Error ? error.message : String(error) }); }
    finally { setConnectBusy(false); }
  };
  const [mounted, setMounted] = useState(false);
  const autoplaySimilar = usePlayerStore((state) => state.autoplaySimilar);
  const setAutoplaySimilar = usePlayerStore(
    (state) => state.setAutoplaySimilar,
  );
  const trackDoubleClickBehavior = usePlayerStore(
    (state) => state.trackDoubleClickBehavior,
  );
  const setTrackDoubleClickBehavior = usePlayerStore(
    (state) => state.setTrackDoubleClickBehavior,
  );
  const defaultPlaybackContext = usePlayerStore(
    (state) => state.defaultPlaybackContext,
  );
  const setDefaultPlaybackContext = usePlayerStore(
    (state) => state.setDefaultPlaybackContext,
  );
  const pauseOnDeviceChange = usePlayerStore(
    (state) => state.pauseOnDeviceChange,
  );
  const setPauseOnDeviceChange = usePlayerStore(
    (state) => state.setPauseOnDeviceChange,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <SettingSection>

      <SettingRow
        title={t("settings.autoplay_similar.title")}
        description={t("settings.autoplay_similar.description")}
        titleKey="settings.autoplay_similar.title"
        descKey="settings.autoplay_similar.description"
        searchQuery={searchQuery}
        control={
          <ToggleSwitch
            checked={autoplaySimilar}
            onChange={setAutoplaySimilar}
          />
        }
      />

      <SettingRow
        title={t("settings.track_double_click.title")}
        description={t("settings.track_double_click.description")}
        titleKey="settings.track_double_click.title"
        descKey="settings.track_double_click.description"
        searchQuery={searchQuery}
        control={
          mounted ? (
            <SegmentedControl
              ariaLabel={t("settings.track_double_click.title")}
              value={trackDoubleClickBehavior}
              onChange={setTrackDoubleClickBehavior}
              options={[
                {
                  value: "play",
                  label: t("settings.track_double_click.play"),
                },
                {
                  value: "queue",
                  label: t("settings.track_double_click.queue"),
                },
              ]}
            />
          ) : (
            <span />
          )
        }
      />

      <SettingRow
        title={t("settings.default_playback_context.title")}
        description={t("settings.default_playback_context.description")}
        titleKey="settings.default_playback_context.title"
        descKey="settings.default_playback_context.description"
        searchQuery={searchQuery}
        control={
          mounted ? (
            <SegmentedControl
              ariaLabel={t("settings.default_playback_context.title")}
              value={defaultPlaybackContext}
              onChange={setDefaultPlaybackContext}
              options={[
                {
                  value: "resume",
                  label: t("settings.default_playback_context.resume"),
                },
                {
                  value: "empty",
                  label: t("settings.default_playback_context.empty"),
                },
              ]}
            />
          ) : (
            <span />
          )
        }
      />

      <SettingRow
        title={t("settings.audio.pause_on_device_change.title")}
        description={t("settings.audio.pause_on_device_change.description")}
        titleKey="settings.audio.pause_on_device_change.title"
        descKey="settings.audio.pause_on_device_change.description"
        searchQuery={searchQuery}
        control={
          <ToggleSwitch
            checked={pauseOnDeviceChange}
            onChange={setPauseOnDeviceChange}
          />
        }
      />
      <SettingRow
        title="Wavo Connect"
        description={de ? "Wiedergabe auf deinen angemeldeten Geräten steuern und fortsetzen." : "Control and continue playback on your signed-in devices."}
        searchQuery={searchQuery}
        control={<div className="flex max-w-[360px] flex-wrap justify-end gap-[6px]">
          {devices.map((device) => <button key={device.device_id} type="button"
            disabled={connectBusy || !deviceOnline(device.last_seen_at)}
            onClick={() => void connectAction(() => activeConnect!.selectDevice(device.device_id))}
            className={`rounded-[8px] border px-[9px] py-[6px] text-[11px] disabled:opacity-40 ${selectedDeviceId === device.device_id ? "border-accent text-accent" : "border-border-alpha-15 text-text-secondary"}`}>
            {device.display_name}{device.device_id === localDeviceId ? (de ? " · dieses Gerät" : " · this device") : ""}
          </button>)}
          {!devices.length && <span className="text-[11px] text-text-tertiary">{de ? "Keine Geräte online" : "No devices online"}</span>}
        </div>}
      />
      <SettingRow
        title={de ? "Dieses Gerät fernsteuern" : "Control this device remotely"}
        description={de ? "Nur Geräte deines angemeldeten Kontos können Befehle senden." : "Only devices signed in to your account can send commands."}
        searchQuery={searchQuery}
        control={<ToggleSwitch checked={localAcceptsControl} onChange={(enabled) => void connectAction(() => activeConnect!.setAcceptsControl(enabled))} />}
      />
      {selectedDevice && <SettingRow
        title={de ? "Fernsteuerung" : "Remote control"}
        description={de ? `Aktiv: ${selectedDevice.display_name}` : `Active: ${selectedDevice.display_name}`}
        searchQuery={searchQuery}
        control={<div className="flex flex-wrap items-center justify-end gap-[5px]">
          {([ ["previous", "⏮"], ["play", "▶"], ["pause", "⏸"], ["next", "⏭"] ] as const).map(([kind, icon]) =>
            <button key={kind} type="button" disabled={connectBusy || !deviceOnline(selectedDevice.last_seen_at)}
              title={kind} onClick={() => void connectAction(() => activeConnect!.send(selectedDevice.device_id, kind))}
              className="rounded-[7px] border border-border-alpha-15 px-[8px] py-[5px] text-[13px] hover:bg-white/10 disabled:opacity-40">{icon}</button>)}
          {selectedDevice.device_id !== localDeviceId && <button type="button" disabled={connectBusy || !deviceOnline(selectedDevice.last_seen_at)}
            onClick={() => void connectAction(() => activeConnect!.transfer(localDeviceId!))}
            className="rounded-[7px] border border-border-alpha-15 px-[8px] py-[5px] text-[11px] hover:bg-white/10 disabled:opacity-40">{de ? "Hier fortsetzen" : "Continue here"}</button>}
          {selectedDevice.device_id !== localDeviceId && <button type="button" disabled={connectBusy || !deviceOnline(selectedDevice.last_seen_at)}
            onClick={() => void connectAction(() => activeConnect!.transfer(selectedDevice.device_id))}
            className="rounded-[7px] border border-border-alpha-15 px-[8px] py-[5px] text-[11px] hover:bg-white/10 disabled:opacity-40">{de ? "Dorthin senden" : "Send there"}</button>}
          {selectedDevice.device_id !== localDeviceId && <button type="button" disabled={connectBusy || !deviceOnline(selectedDevice.last_seen_at)}
            onClick={() => void connectAction(() => activeConnect!.send(selectedDevice.device_id, "queue", { queue: usePlayerStore.getState().queue.slice(0, 100) }))}
            className="rounded-[7px] border border-border-alpha-15 px-[8px] py-[5px] text-[11px] hover:bg-white/10 disabled:opacity-40">{de ? "Warteschlange senden" : "Send queue"}</button>}
          {typeof (selectedDevice.playback_snapshot.track as { durationMs?: unknown } | null)?.durationMs === "number" &&
            <input type="range" min="0" max={Number((selectedDevice.playback_snapshot.track as { durationMs: number }).durationMs)} step="1000"
              defaultValue={Number(selectedDevice.playback_snapshot.positionMs) || 0}
              aria-label={de ? "Position auf Gerät" : "Position on device"}
              onMouseUp={(event) => void connectAction(() => activeConnect!.send(selectedDevice.device_id, "seek", { positionMs: Number(event.currentTarget.value) }))}
              onTouchEnd={(event) => void connectAction(() => activeConnect!.send(selectedDevice.device_id, "seek", { positionMs: Number(event.currentTarget.value) }))}
              className="w-[85px] accent-accent" />}
          {selectedDevice.supports_volume && <input type="range" min="0" max="1" step="0.05"
            defaultValue={Number(selectedDevice.playback_snapshot.volume) || 0.5}
            aria-label={de ? "Lautstärke" : "Volume"}
            onChange={(event) => void connectAction(() => activeConnect!.send(selectedDevice.device_id, "volume", { volume: Number(event.target.value) }))}
            className="w-[75px] accent-accent" />}
        </div>}
      />}
      {connectError && <p role="alert" className="px-[12px] text-[11px] text-red-300">{connectError}</p>}
      <SmartPlaylistsPanel />
    </SettingSection>
  );
}
