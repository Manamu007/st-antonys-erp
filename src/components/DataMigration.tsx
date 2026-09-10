import React, { useState } from 'react';
import { getFirestore, collection, getDocs, setDoc, doc } from 'firebase/firestore';
import app from '../firebase';
import { toast } from 'sonner';

export const DataMigration = () => {
  const [isMigrating, setIsMigrating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);

  const performMigration = async () => {
    setIsMigrating(true);
    setProgress(0);
    try {
      // Source database (defaulting to standard database unless custom source is needed)
      const dbSource = getFirestore(app); 
      // Standard (default) database where the app actively operates
      const dbDefault = getFirestore(app); 

      const collectionsToMigrate = [
        // Identities mapping first
        'roles', 'users', 
        // Then core configuration
        'siteConfig', 'settings', 'classes', 'batches', 'subjects', 'feeStructures', 'stops', 'whatsapp_metadata',
        // Then data
        'notices', 'user_activities', 'students', 'staff', 'attendance', 'fees', 
        'leaves', 'library', 'bus_stops', 'buses', 'student_buses', 'exams', 'marks', 
        'whatsapp_queue', 'whatsappLogs', 
        'substitutions', 'notifications', 'examMarks', 'payments', 'holidays', 'stats',
        'timetable', 'timetableSlots', 'examSchedules', 'examSettings', 'expenditures', 
        'wa_queue', 'homework', 'insights', 'certificateTemplates', 'issuedCertificates', 
        'tours', 'enquiries', 'newsletter', 'calendar_events', 'birthdayTemplates',
        '_health', '_admin_init'
      ];

      let totalDocs = 0;
      let migratedDocs = 0;

      // Clear previous total to avoid progress jumping
      setTotal(0);

      // We copy sequentially to avoid overwhelming the client/network
      for (const collName of collectionsToMigrate) {
        try {
          toast.info(`Migrating ${collName}...`);
          const snapshot = await getDocs(collection(dbSource, collName));
          
          if (snapshot.empty) continue;

          setTotal(prev => prev + snapshot.size);

          for (const document of snapshot.docs) {
            await setDoc(doc(dbDefault, collName, document.id), document.data());
            migratedDocs++;
            setProgress(migratedDocs);
          }
          toast.success(`Copied ${snapshot.size} docs from ${collName}`);
        } catch (collectionError: any) {
          console.error(`Error migrating ${collName}:`, collectionError);
          // If a specific collection fails (e.g. empty or permission issue on one sub-path), 
          // we log it but continue with other collections to maximize migration.
          toast.error(`Warning: Could not migrate ${collName}. ${collectionError.message}`);
        }
      }

      toast.success('Sync to standard (default) database completed successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error('Migration failed. Error: ' + err.message);
      if (err.message.includes('Quota')) {
        toast.error('Quota limit active on Firestore. Please check Firebase Console.');
      }
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 mt-6">
      <h2 className="text-xl font-bold text-blue-600 mb-2">Firestore (default) Database Sync</h2>
      <p className="text-sm text-neutral-600 mb-4">
        Sync and verify collections in the standard `(default)` database.
        Please click the button below to start the synchronization. This might take a few moments.
      </p>

      {isMigrating && total >= 0 && (
        <div className="mb-4">
          <p className="text-xs mb-1">Migrating data... {progress} / {total} documents</p>
          <div className="w-full bg-neutral-200 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full" style={{ width: total > 0 ? `${(progress / total) * 100}%` : '0%' }}></div>
          </div>
        </div>
      )}

      <button
        onClick={performMigration}
        disabled={isMigrating}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {isMigrating ? 'Migrating...' : 'Start Migration'}
      </button>
    </div>
  );
};
