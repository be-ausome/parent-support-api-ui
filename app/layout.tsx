export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
