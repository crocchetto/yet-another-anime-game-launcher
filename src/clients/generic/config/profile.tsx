import {
  Box,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormLabel,
  HStack,
  Input,
  notificationService,
  Select,
  SelectContent,
  SelectIcon,
  SelectListbox,
  SelectOption,
  SelectOptionIndicator,
  SelectOptionText,
  SelectTrigger,
  SelectValue,
  Text,
  VStack,
} from "@hope-ui/solid";
import { For, Show } from "solid-js";
import { Locale, LocaleTextKey } from "@locale";
import { exec, log, readFile, writeFile } from "@utils";
import {
  exportProfile,
  GenericProfile,
  importProfile,
  profile,
  RELAUNCH_KEYS,
  setProfileValue,
} from "../profile";

async function chooseSaveFile(
  title: string,
  defaultName: string
): Promise<string | undefined> {
  const q = (s: string) =>
    `"${s.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  const choose = `set f to choose file name with prompt ${q(
    title
  )} default name ${q(
    defaultName
  )} default location (path to documents folder)`;
  try {
    const { stdOut } = await exec([
      "osascript",
      "-e",
      choose,
      "-e",
      "POSIX path of f",
    ]);
    return stdOut.trim() || undefined;
  } catch (e) {
    if (String(e).includes("-128")) return undefined;
    throw e;
  }
}

const DETECTION_KEYS: (keyof GenericProfile)[] = [
  "executable",
  "dataDir",
  "unityRegistryKey",
];

type TextKey = Exclude<
  keyof GenericProfile,
  "jadeite" | "mediaFoundation" | "backgroundVideo" | "sync"
>;

export default async function ({
  locale,
  onDetectionChanged,
  defaultExportName,
}: {
  locale: Locale;
  onDetectionChanged: () => Promise<void>;
  defaultExportName: () => string;
}) {
  async function save<K extends keyof GenericProfile>(
    key: K,
    value: GenericProfile[K]
  ) {
    if (profile()[key] === value) return;
    await setProfileValue(key, value);
    if (DETECTION_KEYS.includes(key)) await onDetectionChanged();
  }

  async function onExport() {
    let path: string | undefined;
    try {
      path = await chooseSaveFile(
        locale.get("SETTING_PROFILE_EXPORT"),
        defaultExportName()
      );
      if (!path) return;
      if (!/\.json$/i.test(path)) path += ".json";
      await writeFile(path, exportProfile());
    } catch (e) {
      await log(`generic: profile export failed: ${e}`);
      await locale.alert(
        "SETTING_PROFILE_EXPORT_FAILED",
        "SETTING_PROFILE_EXPORT_FAILED_DESC",
        [String(e)]
      );
      return;
    }
    notificationService.show({
      status: "success",
      title: locale.get("SETTING_PROFILE_EXPORTED"),
      description: path,
    });
  }

  async function onImport() {
    let path: string | undefined;
    try {
      [path] = await Neutralino.os.showOpenDialog(
        locale.get("SETTING_PROFILE_IMPORT"),
        {}
      );
    } catch (e) {
      await log(`generic: open dialog failed: ${e}`);
    }
    if (!path) return;
    let changed: (keyof GenericProfile)[];
    try {
      changed = await importProfile(await readFile(path));
    } catch (e) {
      await log(`generic: profile import failed: ${e}`);
      await locale.alert(
        "SETTING_PROFILE_IMPORT_FAILED",
        "SETTING_PROFILE_IMPORT_FAILED_DESC",
        [String(e)]
      );
      return;
    }
    if (changed.some(k => DETECTION_KEYS.includes(k))) {
      await onDetectionChanged();
    }
    notificationService.show({
      status: "success",
      title: locale.get("SETTING_PROFILE_IMPORTED"),
      description: changed.some(k => RELAUNCH_KEYS.includes(k))
        ? locale.get("SETTING_PROFILE_RELAUNCH_DESC")
        : path,
    });
  }

  function TextField(props: {
    field: TextKey;
    label: LocaleTextKey;
    placeholder?: LocaleTextKey;
  }) {
    return (
      <FormControl id={`generic_${props.field}`}>
        <FormLabel>{locale.get(props.label)}</FormLabel>
        <Input
          value={profile()[props.field]}
          placeholder={
            props.placeholder ? locale.get(props.placeholder) : undefined
          }
          onChange={e => save(props.field, e.target.value.trim())}
        />
      </FormControl>
    );
  }

  return [
    function UI() {
      return (
        <VStack spacing="$4" alignItems="stretch">
          <HStack spacing="$4">
            <Button size="sm" variant="subtle" onClick={onImport}>
              {locale.get("SETTING_PROFILE_IMPORT")}
            </Button>
            <Button size="sm" variant="subtle" onClick={onExport}>
              {locale.get("SETTING_PROFILE_EXPORT")}
            </Button>
          </HStack>

          <Divider />

          <TextField
            field="executable"
            label="SETTING_PROFILE_EXECUTABLE"
            placeholder="SETTING_PROFILE_AUTO"
          />
          <TextField
            field="dataDir"
            label="SETTING_PROFILE_DATA_DIR"
            placeholder="SETTING_PROFILE_AUTO"
          />
          <TextField field="launchArgs" label="SETTING_PROFILE_LAUNCH_ARGS" />
          <FormControl id="generic_jadeite">
            <FormLabel>{locale.get("SETTING_PROFILE_JADEITE")}</FormLabel>
            <Box>
              <Checkbox
                checked={profile().jadeite}
                onChange={() => save("jadeite", !profile().jadeite)}
                size="md"
              >
                {locale.get("SETTING_ENABLED")}
              </Checkbox>
            </Box>
          </FormControl>

          <FormControl id="generic_mediaFoundation">
            <FormLabel>
              {locale.get("SETTING_PROFILE_MEDIA_FOUNDATION")}
            </FormLabel>
            <Box>
              <Checkbox
                checked={profile().mediaFoundation}
                onChange={() =>
                  save("mediaFoundation", !profile().mediaFoundation)
                }
                size="md"
              >
                {locale.get("SETTING_ENABLED")}
              </Checkbox>
            </Box>
          </FormControl>
          <Divider />

          <TextField
            field="blockNetHost"
            label="SETTING_PROFILE_BLOCK_NET_HOST"
          />
          <Show when={profile().blockNetHost}>
            <TextField
              field="blockNetSeconds"
              label="SETTING_PROFILE_BLOCK_NET_SECONDS"
            />
          </Show>

          <Divider />

          <TextField
            field="backgroundUrl"
            label="SETTING_PROFILE_BACKGROUND_URL"
          />
          <TextField
            field="backgroundBiz"
            label="SETTING_PROFILE_BACKGROUND_BIZ"
            placeholder="SETTING_PROFILE_AUTO"
          />
          <FormControl id="generic_backgroundVideo">
            <FormLabel>
              {locale.get("SETTING_PROFILE_BACKGROUND_VIDEO")}
            </FormLabel>
            <Box>
              <Checkbox
                checked={profile().backgroundVideo}
                onChange={() =>
                  save("backgroundVideo", !profile().backgroundVideo)
                }
                size="md"
              >
                {locale.get("SETTING_ENABLED")}
              </Checkbox>
            </Box>
          </FormControl>
          <Text size="sm" color="$neutral11">
            {locale.get("SETTING_PROFILE_RELAUNCH_DESC")}
          </Text>

          <Divider />

          <FormControl id="generic_sync">
            <FormLabel>{locale.get("SETTING_PROFILE_SYNC")}</FormLabel>
            <Select
              value={profile().sync}
              onChange={(v: GenericProfile["sync"]) => save("sync", v)}
            >
              <SelectTrigger>
                <SelectValue />
                <SelectIcon />
              </SelectTrigger>
              <SelectContent>
                <SelectListbox>
                  <For each={["msync", "esync"] as const}>
                    {item => (
                      <SelectOption value={item}>
                        <SelectOptionText>{item}</SelectOptionText>
                        <SelectOptionIndicator />
                      </SelectOption>
                    )}
                  </For>
                </SelectListbox>
              </SelectContent>
            </Select>
          </FormControl>
          <TextField field="dxmtConfig" label="SETTING_PROFILE_DXMT_CONFIG" />
          <TextField
            field="unityRegistryKey"
            label="SETTING_PROFILE_REGISTRY_KEY"
            placeholder="SETTING_PROFILE_AUTO"
          />
        </VStack>
      );
    },
  ] as const;
}
