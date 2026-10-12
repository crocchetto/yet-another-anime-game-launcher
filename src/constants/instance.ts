// Need this so more generic anime games can be used at the same time without problems
const raw = String(import.meta.env["YAAGL_GENERIC_INSTANCE"] ?? "");

export const YAAGL_GENERIC_INSTANCE: number = /^([1-9]|1[0-2])$/.test(raw)
  ? parseInt(raw)
  : 0;

export const ARIA2_RPC_PORT = 6868 + YAAGL_GENERIC_INSTANCE;
