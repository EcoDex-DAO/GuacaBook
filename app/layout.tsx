import "./style.css";
export const metadata = {
  title: "GuacaBook",
  description: "Collecte photographique et annotation des aras",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
