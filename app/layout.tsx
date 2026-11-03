import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'LinkLens — Look closer before you pay',description:'Understand suspicious payment links and QR codes with clear, evidence-based reports.',robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
