import { AlertTriangle } from 'lucide-react';

export default function SubscriptionBanner({ message }) {
  if (!message) return null;
  return (
    <div className="bg-red-600 text-white px-4 py-3 text-center">
      <div className="flex items-center justify-center gap-2 max-w-2xl mx-auto">
        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
        <p className="text-sm font-medium">{message}</p>
      </div>
    </div>
  );
}
