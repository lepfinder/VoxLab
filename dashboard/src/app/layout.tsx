import "./globals.css";

export const metadata = {
  title: "HomeCore AI Dashboard",
  description: "Enterprise local AI platform management",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
