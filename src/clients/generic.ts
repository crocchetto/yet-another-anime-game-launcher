import s from "../assets/Nahida.cr.png";

import type { CreateClientOptions } from "./shared";
import { createGenericChannelClient } from "./generic/index";

export const DEFAULT_WINE_DISTRO_TAG = "11.0-1-crossover-signed-experimental";
export const DEFAULT_WINE_DISTRO_URL =
  "https://github.com/yaagl/anime-game-wine/releases/download/wine-crossover-11.0-1-signed/wine-crossover-11.0-1-osx64-signed.tar.xz";

export function createClient(options: CreateClientOptions) {
  return createGenericChannelClient(options);
}

export const UPDATE_UI_IMAGE = s;
