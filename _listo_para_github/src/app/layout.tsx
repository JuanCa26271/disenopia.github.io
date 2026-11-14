import './globals.css';
import type { Metadata } from 'next';
export const metadata:Metadata={title:'MAGA | Velas, recuerdos y más',description:'Detalles artesanales para celebrar los momentos que importan.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es-MX"><body>{children}</body></html>}
