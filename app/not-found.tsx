import Link from 'next/link';
import {Search} from 'lucide-react';
export default function NotFound(){return <main className="shell empty"><Search size={38}/><h1>Nothing at this address.</h1><p>This page does not exist. If you have a private report link, open the complete link including its access fragment.</p><Link href="/" className="primary">Start a link analysis</Link></main>}
