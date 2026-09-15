import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { HardDrive, Trash2, File, Calendar, Database, AlertCircle, RefreshCw, ExternalLink, Cloud } from 'lucide-react';
import { toast } from 'sonner';

interface FileInfo {
  name: string;
  path: string;
  url: string;
  size: number;
  createdAt: string;
}

const StorageManagement: React.FC = () => {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/maintenance/storage');
      const data = await res.json();
      if (data.success && Array.isArray(data.files)) {
        setFiles(data.files.sort((a: FileInfo, b: FileInfo) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      } else {
        setFiles([]);
      }
    } catch (error) {
      console.error('Error fetching storage:', error);
      toast.error('Error loading storage files');
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('WARNING: This will delete files from uploads. This cannot be undone. Are you sure?')) return;
    
    setClearing(true);
    try {
      for (const file of files) {
        await fetch(`/api/maintenance/storage?path=${encodeURIComponent(file.path)}`, { method: 'DELETE' });
      }
      toast.success('All storage files cleared');
      fetchFiles();
    } catch (error) {
      toast.error('Failed to clear some files from storage');
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleDelete = async (filePath: string) => {
    setDeleting(filePath);
    try {
      const res = await fetch(`/api/maintenance/storage?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('File deleted from storage');
        fetchFiles();
      } else {
        throw new Error(data.error || 'Failed to delete');
      }
    } catch (error) {
      toast.error('Error deleting file');
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalSize = files.reduce((acc, file) => acc + file.size, 0);

  return (
    <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-sidebar tracking-tight flex items-center gap-3">
            <Database className="w-8 h-8 text-primary" />
            Storage Management
          </h1>
          <p className="text-neutral-500 font-medium">Manage local application media and files.</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleClearAll}
            disabled={clearing || files.length === 0}
            className="px-6 py-3 bg-rose-500 hover:bg-rose-600 disabled:bg-neutral-100 disabled:text-neutral-400 text-white rounded-2xl font-black shadow-sm transition-all flex items-center gap-2"
          >
            {clearing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Clear All
          </button>
          <div className="bg-white px-6 py-3 rounded-2xl shadow-sm border border-neutral-100 flex items-center gap-4">
             <div className="bg-primary/10 p-2 rounded-xl">
               <HardDrive className="w-5 h-5 text-primary" />
             </div>
             <div>
               <p className="text-xs text-neutral-400 font-bold uppercase tracking-wider">Total Usage</p>
               <p className="text-lg font-black text-sidebar">{formatSize(totalSize)}</p>
             </div>
          </div>
          <button 
            onClick={fetchFiles}
            className="p-3 bg-white hover:bg-neutral-50 rounded-2xl border border-neutral-100 shadow-sm transition-all"
          >
            <RefreshCw className={`w-5 h-5 text-neutral-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="bg-blue-50 border border-blue-200 p-6 rounded-3xl flex gap-4 items-start shadow-sm">
        <div className="bg-blue-100 p-2 rounded-xl text-blue-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-blue-900 font-bold mb-1 tracking-tight">Application Storage</h3>
          <p className="text-blue-700/80 text-sm leading-relaxed font-medium">
            Media and documents uploaded to the system are stored in the server uploads repository. Communication files in <code className="bg-white/50 px-1 rounded font-mono">comm/</code> are maintained automatically.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl shadow-neutral-100 border border-neutral-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-neutral-50/50 border-b border-neutral-100">
                <th className="px-8 py-5 text-xs font-black text-neutral-400 uppercase tracking-widest">File Info</th>
                <th className="px-8 py-5 text-xs font-black text-neutral-400 uppercase tracking-widest text-center">Size</th>
                <th className="px-8 py-5 text-xs font-black text-neutral-400 uppercase tracking-widest text-center">Created</th>
                <th className="px-8 py-5 text-xs font-black text-neutral-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {files.length === 0 && !loading ? (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center">
                    <div className="bg-neutral-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4 text-neutral-300">
                      <File className="w-10 h-10" />
                    </div>
                    <p className="text-neutral-400 font-bold tracking-tight">No files found in local storage.</p>
                  </td>
                </tr>
              ) : (
                files.map((file, idx) => (
                  <motion.tr 
                    key={file.path}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="hover:bg-neutral-50/50 transition-colors group"
                  >
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="bg-neutral-100 p-3 rounded-2xl text-neutral-500 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                          <File className="w-6 h-6" />
                        </div>
                        <div className="max-w-xs xl:max-w-md">
                          <p className="text-sidebar font-black truncate tracking-tight">{file.name}</p>
                          <p className="text-xs text-neutral-400 font-mono mt-0.5 truncate uppercase">{file.path}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className="bg-neutral-100 text-neutral-600 px-4 py-1.5 rounded-full text-xs font-black tracking-wider">
                        {formatSize(file.size)}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <div className="inline-flex items-center gap-2 text-neutral-500 font-bold text-sm">
                        <Calendar className="w-4 h-4 opacity-50" />
                        {new Date(file.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center justify-end gap-3 translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                        {confirmDelete === file.path ? (
                          <div className="flex items-center gap-2 animate-in slide-in-from-right-2">
                             <button 
                               onClick={() => setConfirmDelete(null)}
                               className="px-3 py-2 bg-neutral-100 text-neutral-600 rounded-xl text-xs font-bold hover:bg-neutral-200"
                             >
                               Cancel
                             </button>
                             <button 
                               onClick={() => handleDelete(file.path)}
                               disabled={deleting === file.path}
                               className="px-3 py-2 bg-rose-500 text-white rounded-xl text-xs font-black hover:bg-rose-600 disabled:opacity-50"
                             >
                               Confirm
                             </button>
                          </div>
                        ) : (
                          <>
                            <a 
                              href={file.url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="p-3 bg-white text-neutral-500 hover:text-primary hover:bg-primary/10 rounded-2xl transition-all shadow-sm border border-neutral-100"
                            >
                              <ExternalLink className="w-5 h-5" />
                            </a>
                            <button 
                              onClick={() => setConfirmDelete(file.path)}
                              className="p-3 bg-white text-rose-500 hover:bg-rose-50 rounded-2xl transition-all shadow-sm border border-rose-100"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="mt-8 bg-neutral-50 p-8 rounded-[2.5rem] border border-neutral-100 italic text-neutral-500 text-sm font-medium leading-relaxed">
        <p className="mb-3 font-bold text-neutral-600">Cross-Storage Insight:</p>
        <p>The <span className="text-rose-500 font-bold">8.75 GB</span> seen in your Google Cloud Storage (image 6) belongs to the <span className="font-bold">Build Artifacts</span> and versions managed by the platform. Every deployment of this app creates a snapshot there.</p>
        <p className="mt-2 text-primary font-bold">The table above manages your "Media files/" bucket shown in image 7, where user-uploaded staff photos, school logos, and shared documents live.</p>
      </div>
    </div>
  );
};

export default StorageManagement;
