import { join } from "path-browserify";
import { CommonUpdateProgram } from "@common-update-ui";
import { Config } from "@config";
import { Wine } from "@wine";
import {
  exec,
  log,
  mkdirp,
  readBinary,
  removeFile,
  resolve,
  utf16le,
  writeBinary,
  writeFile,
} from "@utils";
import { patchProgram, patchRevertProgram } from "./patch";
import { MF_DLLS } from "../../wine/mf";
import type { DetectedGame } from "./index";
import { blockNetSecondsOf, GenericProfile, launchArgsOf } from "./profile";

const SYSTEM_FILES = [atob("SG9Zb0tQcm90ZWN0LnN5cw==")];

export function removedFilesFor(dataDir: string): string[] {
  return [
    "UnityCrashHandler64.exe",
    `${dataDir}/upload_crash.exe`,
    `${dataDir}/Plugins/crashreport.exe`,
    `${dataDir}/Plugins/vulkan-1.dll`,
    `${dataDir}/Plugins/x86_64/crashreport.exe`,
    `${dataDir}/Plugins/x86_64/vulkan-1.dll`,
  ];
}

export async function* launchGameProgram({
  gameDir,
  detected,
  wine,
  config,
  profile,
}: {
  gameDir: string;
  detected: DetectedGame;
  wine: Wine;
  config: Config;
  profile: GenericProfile;
}): CommonUpdateProgram {
  yield ["setUndeterminedProgress"];
  yield ["setStateText", "PATCHING"];

  await wine.setProps(config);

  const args = launchArgsOf(profile);
  if (config.resolutionCustom) {
    args.push("-screen-width", config.resolutionWidth);
    args.push("-screen-height", config.resolutionHeight);
    args.push("-screen-fullscreen", "0");
  }

  const exe = `"${wine.toWinePath(join(gameDir, detected.executable))}"`;
  const launchLine = profile.jadeite
    ? `"${wine.toWinePath(resolve("./jadeite/jadeite.exe"))}" ${exe}`
    : exe;

  const copyLines = SYSTEM_FILES.map(
    f => `copy "${wine.toWinePath(join(gameDir, f))}" "%WINDIR%\\system32\\"\n`
  );

  const cmd = `@echo off
cd "%~dp0"
${copyLines.join("")}cd /d "${wine.toWinePath(gameDir)}"
${launchLine} ${args.join(" ")}`;
  await writeFile(resolve("config.bat"), cmd);

  yield* patchProgram(gameDir, wine, removedFilesFor(detected.dataDir), config);
  await mkdirp(resolve("./logs"));
  const yaaglDir = resolve("./");
  try {
    yield ["setStateText", "GAME_RUNNING"];
    const logfile = resolve(`./logs/game_${Date.now()}.log`);

    if (config.blockNet && profile.blockNetHost) {
      const tmpScriptPath = "/tmp/yaagl_network_block_script.sh";
      const commands = [
        `#!/bin/sh`,

        `HOSTS_FILE="/etc/hosts"`,
        `ENTRY="0.0.0.0 ${profile.blockNetHost}"`,
        `PAD_START="# Temporarily Added by Yaagl"`,
        `PAD_END="# End of section"`,

        `if ! grep -qF "$ENTRY" "$HOSTS_FILE"; then`,
        `sudo bash -c "echo -e '$PAD_START\n$ENTRY\n$PAD_END' >> '/etc/hosts'"`,
        `fi`,
        `sleep ${blockNetSecondsOf(profile)}`,
        `sudo sed -i.bak "/$PAD_START/,/$PAD_END/d" "$HOSTS_FILE"`,

        `rm ${tmpScriptPath}`,
      ];

      await writeFile(tmpScriptPath, commands.join("\n"));
      await exec(
        [
          "osascript",
          "-e",
          `do shell script "source ${tmpScriptPath} > /dev/null 2>&1 &" with administrator privileges`,
        ],
        {},
        false
      );
    }

    await wine.exec2(
      config.steamPatch ? "C:\\windows\\system32\\steam.exe" : "cmd",
      config.steamPatch
        ? [wine.toWinePath(join(gameDir, detected.executable)), ...args]
        : ["/c", `${wine.toWinePath(resolve("./config.bat"))}`],
      {
        MTL_HUD_ENABLED: config.metalHud ? "1" : "0",
        WINEDLLOVERRIDES: profile.mediaFoundation
          ? ""
          : `${MF_DLLS.join(",")}=b`,
        WINE_ENABLE_TIMEOUT_FIX: config.timeoutFix ? "1" : "0",
        ...(wine.attributes.renderBackend == "dxmt"
          ? {
              ...(profile.sync == "msync"
                ? { WINEMSYNC: "1" }
                : { WINEESYNC: "1" }),
              DXMT_LOG_PATH: yaaglDir,
              ...(profile.dxmtConfig
                ? { DXMT_CONFIG: profile.dxmtConfig }
                : {}),
              DXMT_CONFIG_FILE: join(yaaglDir, "dxmt.conf"),
              GST_PLUGIN_FEATURE_RANK: "atdec:MAX,avdec_h264:MAX",
            }
          : {
              WINEESYNC: "1",
            }),
        ...(config.proxyEnabled
          ? {
              HTTP_PROXY: config.proxyHost,
              HTTPS_PROXY: config.proxyHost,
            }
          : {}),
      },
      logfile
    );
    await wine.waitUntilServerOff();
    if (config.resolutionCustom && detected.unityRegistryKey) {
      await revertUnityResolution(wine, detected.unityRegistryKey);
    }
  } catch (e: unknown) {
    await log(String(e));
  }

  await removeFile(resolve("config.bat"));
  yield ["setStateText", "REVERT_PATCHING"];
  yield* patchRevertProgram(gameDir, wine, config);
}

async function revertUnityResolution(wine: Wine, key: string) {
  try {
    const reg = [`Windows Registry Editor Version 5.00`, ``, `[${key}]`];
    await wine.exec("reg", ["query", key], {}, resolve("fix_resolution.log"));
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const output = decoder.decode(
      await readBinary(resolve("fix_resolution.log"))
    );
    for (let line of output.split("\r\n")) {
      line = line.trim();
      if (
        line.startsWith("Screenmanager Is Fullscreen mode_") ||
        line.startsWith("Screenmanager Resolution_")
      ) {
        reg.push(`"${line.split(" ", 2)[0]}"=-`);
      }
    }
    if (reg.length > 3) {
      await writeBinary(
        resolve("fix_resolution.reg"),
        utf16le(reg.join("\r\n"))
      );
      await wine.exec(
        "reg",
        ["import", `${wine.toWinePath(resolve("./fix_resolution.reg"))}`],
        {},
        "/dev/null"
      );
    }
  } catch {
    return;
  }
}
