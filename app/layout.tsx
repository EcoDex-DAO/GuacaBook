import "./style.css";
import { I18nProvider } from "./components/I18n";
export const metadata = {
  title: "GuacaBook",
  description: "Collecte photographique et annotation des aras",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
