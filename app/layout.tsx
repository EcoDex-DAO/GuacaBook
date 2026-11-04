import "./style.css";
import VersionBadge from "./components/VersionBadge";
import { I18nProvider } from "./components/I18n";
export const metadata = {
  title: "GuacaBook",
  description: "Collecte photographique et annotation des aras",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <I18nProvider>{children}<VersionBadge /></I18nProvider>
      </body>
    </html>
  );
}
