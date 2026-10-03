import { Workspace } from '../components/workspace';
import { appMode } from '../server/config';
export const dynamic = 'force-dynamic';
export default function Page() { return <Workspace mode={appMode()} />; }
