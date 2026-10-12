import { createSignal } from "solid-js";
import { getKey, setKey } from "@utils";

export interface GenericProfile {
  executable: string;
  dataDir: string;
  launchArgs: string;
  blockNetHost: string;
  blockNetSeconds: string;
  backgroundUrl: string;
  backgroundBiz: string;
  backgroundVideo: boolean;
  sync: "msync" | "esync";
  dxmtConfig: string;
  unityRegistryKey: string;
  jadeite: boolean;
  mediaFoundation: boolean;
}

export const PROFILE_DEFAULTS: GenericProfile = {
  executable: "",
  dataDir: "",
  launchArgs: "",
  blockNetHost: "",
  blockNetSeconds: "10",
  backgroundUrl: "",
  backgroundBiz: "",
  backgroundVideo: true,
  sync: "msync",
  dxmtConfig: "d3d11.preferredMaxFrameRate=60;",
  unityRegistryKey: "",
  jadeite: false,
  mediaFoundation: false,
};

const PROFILE_KEYS = Object.keys(PROFILE_DEFAULTS) as (keyof GenericProfile)[];

export const RELAUNCH_KEYS: (keyof GenericProfile)[] = [
  "backgroundUrl",
  "backgroundBiz",
  "backgroundVideo",
];

const EXPORT_FORMAT = "yaagl-generic-profile";
const EXPORT_VERSION = 1;

function storageKey(key: keyof GenericProfile) {
  return `config_generic_${key}`;
}

const [profile, setProfile] = createSignal<GenericProfile>({
  ...PROFILE_DEFAULTS,
});

export { profile };

export async function loadProfile(): Promise<GenericProfile> {
  const loaded = { ...PROFILE_DEFAULTS };
  for (const key of PROFILE_KEYS) {
    let raw: string;
    try {
      raw = await getKey(storageKey(key));
    } catch {
      continue;
    }
    assignValue(loaded, key, raw);
  }
  setProfile(loaded);
  return loaded;
}

export async function setProfileValue<K extends keyof GenericProfile>(
  key: K,
  value: GenericProfile[K]
) {
  if (profile()[key] === value) return;
  await setKey(storageKey(key), String(value));
  setProfile({ ...profile(), [key]: value });
}

export function exportProfile(): string {
  return JSON.stringify(
    { format: EXPORT_FORMAT, version: EXPORT_VERSION, profile: profile() },
    null,
    2
  );
}

export async function importProfile(
  json: string
): Promise<(keyof GenericProfile)[]> {
  const data = JSON.parse(json);
  if (data?.format !== EXPORT_FORMAT || typeof data.profile !== "object") {
    throw new Error("not a Yaagl generic profile");
  }
  const next = { ...PROFILE_DEFAULTS };
  for (const key of PROFILE_KEYS) {
    if (key in data.profile) {
      assignValue(next, key, String(data.profile[key]));
    }
  }
  const changed = PROFILE_KEYS.filter(k => next[k] !== profile()[k]);
  for (const key of changed) {
    await setKey(storageKey(key), String(next[key]));
  }
  setProfile(next);
  return changed;
}

function assignValue(
  target: GenericProfile,
  key: keyof GenericProfile,
  raw: string
) {
  switch (key) {
    case "jadeite":
    case "mediaFoundation":
    case "backgroundVideo":
      target[key] = raw == "true";
      break;
    case "sync":
      target.sync = raw == "esync" ? "esync" : "msync";
      break;
    default:
      target[key] = raw;
  }
}

export function launchArgsOf(p: GenericProfile): string[] {
  return p.launchArgs.split(/\s+/).filter(x => x.length > 0);
}

export function blockNetSecondsOf(p: GenericProfile): number {
  const n = parseInt(p.blockNetSeconds);
  return isNaN(n) || n <= 0 ? parseInt(PROFILE_DEFAULTS.blockNetSeconds) : n;
}
