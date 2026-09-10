import React, { useEffect } from 'react';

export const QuotaExceededBanner: React.FC = () => {
  useEffect(() => {
    try {
      localStorage.removeItem('firestore_quota_exceeded_timestamp');
    } catch {}
  }, []);

  // Completely removed - never render quota exceeded banner
  return null;
};

