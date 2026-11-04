"use client";
import { APP_CHANNEL, APP_VERSION } from "../../lib/version";
import { useI18n } from "./I18n";
export default function VersionBadge() {
  const {t}=useI18n();
  return <footer className="app-version" aria-label={t("Version de l’application")}>
    <span>GuacaBook <span data-testid="app-version">v{APP_VERSION}</span> · {t(APP_CHANNEL==="beta"?"Bêta":"Stable")}</span>
  </footer>;
}
