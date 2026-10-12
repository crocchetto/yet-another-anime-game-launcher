import { join } from "path-browserify";
import { CommonUpdateProgram } from "@common-update-ui";
import { Config } from "@config";
import { Wine } from "@wine";
import {
  cp,
  fileOrDirExists,
  forceMove,
  getKey,
  getKeyOrDefault,
  log,
  removeFileIfExists,
  resolve,
  setKey,
} from "@utils";
import { DXMT_FILES } from "../../downloadable-resource";

const REMOVED_KEY = "generic_removed";

export async function* patchProgram(
  gameDir: string,
  wine: Wine,
  removed: string[],
  config: Config
): CommonUpdateProgram {
  if ((await getKeyOrDefault("patched", "NOTFOUND")) != "NOTFOUND") {
    return;
  }

  const renamed: string[] = [];
  if (!config.patchOff) {
    for (const file of removed) {
      if (await fileOrDirExists(join(gameDir, file))) {
        await forceMove(join(gameDir, file), join(gameDir, file + ".bak"));
        renamed.push(file);
        await log("renamed " + file);
      }
    }
  }
  await setKey(REMOVED_KEY, JSON.stringify(renamed));

  const system32Dir = join(wine.prefix, "drive_c", "windows", "system32");

  if (wine.attributes.renderBackend == "dxmt") {
    for (const f of DXMT_FILES) {
      const wineLibPath = resolve(`./wine/lib/wine/x86_64-windows/${f}`);
      await forceMove(wineLibPath, wineLibPath + ".bak");
      await cp(`./dxmt/${f}`, wineLibPath);
    }
    await cp(
      `./dxmt/winemetal.dll`,
      resolve("./wine/lib/wine/x86_64-windows/winemetal.dll")
    );
    await cp(
      `./dxmt/winemetal.so`,
      resolve("./wine/lib/wine/x86_64-unix/winemetal.so")
    );
    await cp(`./dxmt/winemetal.dll`, join(system32Dir, "winemetal.dll"));
  }

  if (config.steamPatch) {
    const syswow64Dir = join(wine.prefix, "drive_c", "windows", "syswow64");
    await cp(
      resolve("./sidecar/protonextras/steam64.exe"),
      join(system32Dir, "steam.exe")
    );
    await cp(
      resolve("./sidecar/protonextras/steam32.exe"),
      join(syswow64Dir, "steam.exe")
    );
    await cp(
      resolve("./sidecar/protonextras/lsteamclient64.dll"),
      join(system32Dir, "lsteamclient.dll")
    );
    await cp(
      resolve("./sidecar/protonextras/lsteamclient32.dll"),
      join(syswow64Dir, "lsteamclient.dll")
    );
  }

  if (config.reshade && wine.attributes.renderBackend == "dxmt") {
    await cp(resolve("./reshade/dxgi.dll"), join(gameDir, "dxgi.dll"));
    await cp(
      resolve("./reshade/d3dcompiler_47.dll"),
      join(gameDir, "d3dcompiler_47.dll")
    );
  }

  await setKey("patched", "1");
}

export async function* patchRevertProgram(
  gameDir: string,
  wine: Wine,
  config: Config
): CommonUpdateProgram {
  try {
    await getKey("patched");
  } catch {
    return;
  }

  let renamed: string[] = [];
  try {
    renamed = JSON.parse(await getKeyOrDefault(REMOVED_KEY, "[]"));
  } catch {
    renamed = [];
  }
  for (const file of renamed) {
    if (await fileOrDirExists(join(gameDir, file + ".bak"))) {
      await forceMove(join(gameDir, file + ".bak"), join(gameDir, file));
    }
  }
  await setKey(REMOVED_KEY, null);

  if (wine.attributes.renderBackend == "dxmt") {
    for (const f of DXMT_FILES) {
      const wineLibPath = resolve(`./wine/lib/wine/x86_64-windows/${f}`);
      if (await fileOrDirExists(wineLibPath + ".bak")) {
        await forceMove(wineLibPath + ".bak", wineLibPath);
      }
    }
  }

  if (config.reshade && wine.attributes.renderBackend == "dxmt") {
    await removeFileIfExists(join(gameDir, "dxgi.dll"));
    await removeFileIfExists(join(gameDir, "d3dcompiler_47.dll"));
  }

  await setKey("patched", null);
}
