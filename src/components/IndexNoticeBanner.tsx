import React from 'react';
import { AlertCircle, ExternalLink } from 'lucide-react';

interface IndexNoticeBannerProps {
  error: any;
}

export const IndexNoticeBanner: React.FC<IndexNoticeBannerProps> = ({ error }) => {
  if (!error) return null;

  const errorMessage = error.message || String(error || "");
  const indexLink = (typeof errorMessage === 'string' ? errorMessage : String(errorMessage)).match(/https:\/\/console\.firebase\.google\.com[^\s]*/)?.[0];
  const isBuilding = errorMessage.toLowerCase().includes('building');

  if (!indexLink) return null;

  return (
    <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6 rounded shadow-sm animate-in fade-in slide-in-from-top-2">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <AlertCircle className="h-5 w-5 text-amber-400" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-bold text-amber-800">
            {isBuilding ? 'Database Index Building...' : 'Database Index Required'}
          </h3>
          <div className="mt-2 text-sm text-amber-700">
            <p>
              {isBuilding 
                ? 'The required database index is currently being built by Firestore. This usually takes a few minutes. You can monitor the progress in the Firebase Console.'
                : 'This query requires a Firestore composite index. Click the button below to open the Firebase Console and create it. The query will start working automatically once the index is built.'}
            </p>
          </div>
          <div className="mt-4">
            <button
              onClick={() => window.open(indexLink, '_blank')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-colors"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              {isBuilding ? 'View Index Status' : 'Create Missing Index'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
