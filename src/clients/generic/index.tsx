import { batch, createSignal, Show } from "solid-js";
import { join } from "path-browserify";
import { CommonUpdateProgram } from "@common-update-ui";
import { Locale } from "@locale";
import { Config } from "@config";
import { Aria2 } from "@aria2";
import { Wine } from "@wine";
import {
  exec,
  fileOrDirExists,
  getKey,
  log,
  readAllLinesIfExists,
  setKey,
  waitImageReady,
  writeFile,
} from "@utils";
import { installMediaFoundation } from "../../wine/mf";
import { ChannelClient, ChannelClientInstallState } from "../../channel-client";
import {
  checkAndDownloadDXMT,
  checkAndDownloadJadeite,
  checkAndDownloadReshade,
} from "../../downloadable-resource";
import createResolution from "../mhy/nap/config/resolution";
import createTimeoutFix from "../mhy/nap/config/timeout-fix";
import createPatchOff from "../mhy/nap/config/patch-off";
import createSteamPatch from "../mhy/nap/config/steam-patch";
import createBlockNet from "../mhy/nap/config/block-net";
import { launchGameProgram } from "./program-launch-game";
import { patchRevertProgram } from "./patch";
import { GenericProfile, loadProfile, profile } from "./profile";
import createProfileTab from "./config/profile";
import fallbackBackground from "../../assets/generic/background.png";
import {
  HoyoConnectGameBackground,
  HoyoConnectGameBackgroundType,
  HoyoConnectGetAllGameBasicInfoResponse,
} from "../mhy/launcher-info";

const MF_MARKER = "yaagl_generic_mf_installed";

export interface DetectedGame {
  executable: string;
  dataDir: string;
  unityRegistryKey?: string;
}

export async function createGenericChannelClient({
  locale,
  aria2,
  wine,
}: {
  locale: Locale;
  aria2: Aria2;
  wine: Wine;
}): Promise<ChannelClient> {
  const initialProfile = await loadProfile();
  const adv = await getBackground(locale, initialProfile);
  const IS_VIDEO_BG =
    adv?.type === HoyoConnectGameBackgroundType.BACKGROUND_TYPE_VIDEO;
  const state = await checkGameState(initialProfile);

  const [installed, setInstalled] = createSignal<ChannelClientInstallState>(
    state.gameInstalled ? "INSTALLED" : "NOT_INSTALLED"
  );
  const [gameInstallDir, setGameInstallDir] = createSignal(
    state.gameInstallDir
  );
  const [detected, setDetected] = createSignal<DetectedGame | undefined>(
    state.detected
  );

  async function redetect() {
    const dir = gameInstallDir();
    if (!dir) return;
    const found = await detectGame(dir, profile());
    batch(() => {
      setDetected(found);
      setInstalled(found ? "INSTALLED" : "NOT_INSTALLED");
    });
    if (!found) {
      await locale.alert("GAME_NOT_FOUND", "GAME_NOT_FOUND_DESC", [dir]);
    }
  }

  return {
    installState: installed,
    installDir: gameInstallDir,
    installButtonText: "SELECT_GAME",

    updateRequired: () => false,
    showPredownloadPrompt: () => false,
    predownloadVersion: () => "",
    dismissPredownload() {
      return;
    },

    // Webkit doesn't seem to play properly some videos, still a wip
    uiContent: {
      background: adv?.background.url || fallbackBackground,
      background_video:
        IS_VIDEO_BG && initialProfile.backgroundVideo
          ? adv?.video.url || undefined
          : undefined,
      background_theme: IS_VIDEO_BG ? adv?.theme.url || undefined : undefined,
      iconImage: adv?.icon.url || undefined,
      url: adv?.icon.link ?? "",
    },

    async *install(selection: string): CommonUpdateProgram {
      const found = await detectGame(selection, profile());
      if (!found) {
        await locale.alert("GAME_NOT_FOUND", "GAME_NOT_FOUND_DESC", [
          selection,
        ]);
        return;
      }
      batch(() => {
        setInstalled("INSTALLED");
        setGameInstallDir(selection);
        setDetected(found);
      });
      await setKey("game_install_dir", selection);
    },

    async *update() {
      return;
    },
    async *predownload() {
      return;
    },

    // Fake bc I don't want change the whole checkIntegrity pipe
    async *checkIntegrity() {
      return;
    },

    async *launch(config: Config) {
      const found = detected();
      if (!found) return;
      const current = profile();
      if (config.reshade) {
        yield* checkAndDownloadReshade(aria2, wine, gameInstallDir());
      }
      if (wine.attributes.renderBackend == "dxmt") {
        yield* checkAndDownloadDXMT(aria2);
      }
      if (current.jadeite) {
        yield* checkAndDownloadJadeite(aria2);
      }
      // Probably not needed but still could be useful someday somehow somewhere
      if (current.mediaFoundation) {
        const marker = join(wine.prefix, "drive_c", MF_MARKER);
        if (!(await fileOrDirExists(marker))) {
          yield* installMediaFoundation(aria2, wine);
          await writeFile(marker, "1");
        }
      }
      yield* launchGameProgram({
        gameDir: gameInstallDir(),
        detected: found,
        wine,
        config,
        profile: current,
      });
    },

    async *init(config: Config) {
      try {
        await getKey("patched");
      } catch {
        return;
      }
      try {
        yield* patchRevertProgram(gameInstallDir(), wine, config);
      } catch (e) {
        await log(`generic: revert failed during init: ${e}`);
        await setKey("patched", null);
      }
    },

    async createConfig(locale: Locale, config: Partial<Config>) {
      const [PO] = await createPatchOff({ locale, config });
      const [SP] = await createSteamPatch({ locale, config });
      const [BN] = await createBlockNet({ locale, config });
      const [RES] = await createResolution({ locale, config });
      const [TF] = await createTimeoutFix({ locale, config });
      return function () {
        return [
          locale.get("GAME_EXECUTABLE") + ": ",
          detected()?.executable ?? "-",
          <PO />,
          <SP />,
          <Show when={profile().blockNetHost}>
            <BN />
          </Show>,
          <RES />,
          <TF />,
        ];
      };
    },

    async createProfileConfig(locale: Locale) {
      const [UI] = await createProfileTab({
        locale,
        onDetectionChanged: redetect,
        defaultExportName: () => {
          const exe = detected()?.executable;
          return exe
            ? exe.replace(/\.exe$/i, "") + ".profile.json"
            : "profile.json";
        },
      });
      return UI;
    },
  };
}

async function getBackground(
  locale: Locale,
  p: GenericProfile
): Promise<HoyoConnectGameBackground | undefined> {
  if (!p.backgroundUrl) return undefined;
  try {
    const separator = p.backgroundUrl.includes("?") ? "&" : "?";
    const { stdOut } = await exec([
      "curl",
      p.backgroundUrl + `${separator}language=${locale.get("CONTENT_LANG_ID")}`,
    ]);
    const ret: HoyoConnectGetAllGameBasicInfoResponse = JSON.parse(stdOut);
    const list = ret.data.game_info_list;
    const info = p.backgroundBiz
      ? list.find(x => x.game.biz == p.backgroundBiz)
      : list[0];
    if (!info || info.backgrounds.length < 1) {
      throw new Error(`no background for biz ${p.backgroundBiz || "(first)"}`);
    }
    const isVideo = (x: HoyoConnectGameBackground) =>
      x.type === HoyoConnectGameBackgroundType.BACKGROUND_TYPE_VIDEO;
    const bg = [...info.backgrounds].sort(
      (a, b) => Number(isVideo(b)) - Number(isVideo(a))
    )[0];
    await waitImageReady(bg.background.url);
    return bg;
  } catch (e) {
    await log(`generic: failed to load background: ${e}`);
    return undefined;
  }
}

export async function detectGame(
  dir: string,
  p: GenericProfile
): Promise<DetectedGame | undefined> {
  let entries: Neutralino.filesystem.DirectoryEntry[];
  try {
    entries = await Neutralino.filesystem.readDirectory(dir);
  } catch {
    return undefined;
  }
  const files = new Set(
    entries.filter(x => x.type == "FILE").map(x => x.entry)
  );
  const dirs = new Set(
    entries.filter(x => x.type == "DIRECTORY").map(x => x.entry)
  );

  let found: { executable: string; dataDir: string } | undefined;
  if (p.executable) {
    if (!files.has(p.executable)) return undefined;
    found = {
      executable: p.executable,
      dataDir: p.dataDir || p.executable.replace(/\.exe$/i, "") + "_Data",
    };
  } else {
    const candidates = [...dirs]
      .filter(d => d.endsWith("_Data"))
      .filter(d => !p.dataDir || d == p.dataDir)
      .map(d => ({
        dataDir: d,
        executable: d.slice(0, -"_Data".length) + ".exe",
      }))
      .filter(c => files.has(c.executable));
    if (candidates.length > 1) {
      await log(
        `generic: multiple Unity executables found, using ${candidates[0].executable}`
      );
    }
    found = candidates[0];
  }
  if (!found) return undefined;
  return {
    ...found,
    unityRegistryKey:
      p.unityRegistryKey || (await readUnityRegistryKey(dir, found.dataDir)),
  };
}

async function readUnityRegistryKey(
  dir: string,
  dataDir: string
): Promise<string | undefined> {
  try {
    const [company, product] = (
      await readAllLinesIfExists(join(dir, dataDir, "app.info"))
    ).map(x => x.trim());
    if (!company || !product) return undefined;
    const key = `HKEY_CURRENT_USER\\Software\\${company}\\${product}`;
    await log(`generic: unity registry key ${key}`);
    return key;
  } catch {
    return undefined;
  }
}

async function checkGameState(p: GenericProfile) {
  let gameDir = "";
  try {
    gameDir = await getKey("game_install_dir");
  } catch {
    return { gameInstalled: false, gameInstallDir: "" } as const;
  }
  const found = await detectGame(gameDir, p);
  return {
    gameInstalled: !!found,
    gameInstallDir: gameDir,
    detected: found,
  } as const;
}
