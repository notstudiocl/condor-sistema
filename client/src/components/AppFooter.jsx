import { APP_VERSION } from '../version';

export default function AppFooter() {
  return (
    <div className="text-center py-4 mt-6">
      <p className="text-gray-300 text-xs">
        Condor 360 &copy; {new Date().getFullYear()} &middot; v{APP_VERSION}
      </p>
      <p className="text-[10px] text-gray-400 mt-1">
        Sistema integral desarrollado por{' '}
        <a href="https://notstudio.cl" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-200">
          NotStudio.cl
        </a>
      </p>
    </div>
  );
}
