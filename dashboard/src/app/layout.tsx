import "./globals.css";

export const metadata = {
  title: "VoxLab Dashboard",
  description: "Local speech laboratory platform management",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
