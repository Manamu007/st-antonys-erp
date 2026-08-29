# -*- coding: utf-8 -*-
"""
Database Migration Utility: 128-D face-api.js -> 512-D ArcFace Vectors
Provides code and instructions to migrate existing students/staff schema and databases
to accept the new high-accuracy 512-dimensional ArcFace vector columns.
"""

import os
import sys

# ----------------------------------------------------------------------
# Section 1: Relational Database Schema Migration (PostgreSQL / MySQL)
# ----------------------------------------------------------------------

# SQL statement to add the new 512D JSON/Float array column to existing tables
SQL_MIGRATION_PG = """
-- PostgreSQL Migration Script
-- Adds the new 'face_embedding_512d' column to both student and staff tables.
-- Uses standard PostgreSQL JSONB (for speed) or Float array.

-- 1. Migrate students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS face_embedding_512d JSONB DEFAULT NULL;
COMMENT ON COLUMN students.face_embedding_512d IS '512-dimensional ArcFace buffalo_l normalized embedding';

-- 2. Migrate staff table
ALTER TABLE staff ADD COLUMN IF NOT EXISTS face_embedding_512d JSONB DEFAULT NULL;
COMMENT ON COLUMN staff.face_embedding_512d IS '512-dimensional ArcFace buffalo_l normalized embedding';

-- 3. Optionally clean old 128D descriptors if they are no longer needed
-- ALTER TABLE students DROP COLUMN IF EXISTS face_descriptor_old;
"""

SQL_MIGRATION_MYSQL = """
-- MySQL Migration Script
ALTER TABLE students ADD COLUMN face_embedding_512d JSON DEFAULT NULL;
ALTER TABLE staff ADD COLUMN face_embedding_512d JSON DEFAULT NULL;
"""


# ----------------------------------------------------------------------
# Section 2: Firestore Database Migration Script (NoSQL Cloud Integration)
# ----------------------------------------------------------------------

def run_firestore_collection_migration():
    """
    Scans the students and staff collections in Firestore.
    Clears out the legacy 128-dimensional faceDescriptor values to trigger
    immediate face re-registration prompts under the new high-accuracy ArcFace engine,
    ensuring zero face/name mismatches during the transition.
    """
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        
        print("[Migration] Connecting to Firebase Firestore...")
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        db = firestore.client()
        
        collections = ['students', 'staff']
        for col_name in collections:
            print(f"[Migration] Migrating collection: '{col_name}'...")
            docs_ref = db.collection(col_name).stream()
            count = 0
            for doc in docs_ref:
                data = doc.to_dict()
                # If there's an old faceDescriptor, flag it or archive it
                if 'faceDescriptor' in data:
                    # Update document to mark old biometric as expired/requiring update
                    db.collection(col_name).document(doc.id).update({
                        'faceDescriptorOld': data['faceDescriptor'], # Keep backup in faceDescriptorOld
                        'faceDescriptor': firestore.DELETE_FIELD,     # Delete the legacy 128D vector
                        'biometricVerified': False,                   # Require re-registration under ArcFace
                        'biometricNeedsUpgrade': True,
                        'faceEmbedding512D': firestore.DELETE_FIELD   # Ready to accept new 512D vector
                    })
                    count += 1
            print(f"[Migration] Successfully flagged {count} records in '{col_name}' collection for high-accuracy upgrade.")
            
        print("[Migration] Firestore schema/field migration completed successfully!")
    except ImportError:
        print("[Migration Info] 'firebase_admin' package not installed. Skipping live NoSQL migration.")
    except Exception as e:
        print(f"[Migration Error] Firestore migration failed: {str(e)}")


if __name__ == '__main__':
    print("=== HIGH-ACCURACY FACE RECOGNITION MIGRATION GUIDE ===")
    print("1. SQL Database schema migration SQL statements defined in this script:")
    print("   PostgreSQL Statement:\n", SQL_MIGRATION_PG)
    print("   MySQL Statement:\n", SQL_MIGRATION_MYSQL)
    print("-" * 50)
    print("2. Running Firestore schema cleaning to prepare for high-accuracy 512D ArcFace registration...")
    run_firestore_collection_migration()
