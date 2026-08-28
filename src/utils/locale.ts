import type { FluentMessageId } from "../../typings/i10n";

const localeFilesForJS = ["addon.ftl", "preferences.ftl"];

function getLocaleFileFullNames(files: string[]) {
  return files.map(file => `${addon.data.config.addonRef}-${file}`);
}

export function initLocale() {
  const l10n = new Localization(
    getLocaleFileFullNames(localeFilesForJS),
    true,
  );
  addon.data.locale = {
    current: l10n,
  };
}

interface GetStringOptions {
  branch?: string;
  args?: Record<string, unknown>;
}

/**
 * Get a translated string by Fluent message id.
 */
export function getString(id: FluentMessageId): string;
export function getString(id: FluentMessageId, branch: string): string;
export function getString(id: FluentMessageId, options: GetStringOptions): string;
export function getString(...inputs: any[]): string {
  const { id, options } = normalizeOptions(inputs);
  return _getString(id, options);
}

function normalizeOptions(inputs: any[]) {
  if (inputs.length === 1) {
    return { id: inputs[0], options: {} as GetStringOptions };
  }
  const [id, second] = inputs;
  if (typeof second === "string") {
    return { id, options: { branch: second } as GetStringOptions };
  }
  return { id, options: (second ?? {}) as GetStringOptions };
}

function _getString(id: FluentMessageId, options: GetStringOptions): string {
  const localeID = `${addon.data.config.addonRef}-${id}`;
  const { branch, args } = options;

  const msgs = addon.data.locale?.current.formatMessagesSync([{ id: localeID, args }]);
  const pattern = msgs?.[0];
  if (!pattern) {
    return localeID;
  }

  if (branch) {
    const attr = pattern.attributes?.find((a: any) => a.name === branch);
    return attr?.value ?? localeID;
  }

  if (pattern.value) {
    return pattern.value;
  }

  const attr = pattern.attributes?.find((a: any) => a.name === "label");
  return attr?.value ?? localeID;
}
