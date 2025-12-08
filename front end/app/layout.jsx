import './globals.css'
import 'leaflet/dist/leaflet.css'

export const metadata = {
  title: 'Fetch My Route',
  description: 'UMBC GPS front end',
  icons: {
    icon: '/assets/pawprint.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
