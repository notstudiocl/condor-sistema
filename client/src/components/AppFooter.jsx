import { APP_VERSION } from '../version';

export default function AppFooter() {
  return (
    <div className="text-center py-4 mt-6">
      <p className="text-gray-300 text-xs">
        Condor 360 &copy; {new Date().getFullYear()} &middot; v{APP_VERSION}
      </p>
    </div>
  );
}
