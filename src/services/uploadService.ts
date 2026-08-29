import { storage } from '../firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

export const uploadService = {
  processProfileImage: async (file: File): Promise<File> => {
    return new Promise((resolve) => {
      if (!file || !file.type.startsWith('image/')) {
        resolve(file);
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => resolve(file);
      reader.onload = (event) => {
        const img = new Image();
        img.onerror = () => resolve(file);
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(file);
              return;
            }

            // Standard 3:4 ID card resolution (perfect clear quality but compact)
            const targetWidth = 360;
            const targetHeight = 480;

            canvas.width = targetWidth;
            canvas.height = targetHeight;

            const srcAspect = img.width / img.height;
            const targetAspect = 3 / 4;

            let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;

            if (srcAspect > targetAspect) {
              // Source is wider than 3:4, crop sides
              sWidth = img.height * targetAspect;
              sx = (img.width - sWidth) / 2;
            } else {
              // Source is taller than 3:4, crop top/bottom
              sHeight = img.width / targetAspect;
              sy = (img.height - sHeight) / 2;
            }

            ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);

            canvas.toBlob((blob) => {
              if (blob) {
                const resizedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + "_idcard.jpg", {
                  type: 'image/jpeg',
                  lastModified: Date.now()
                });
                resolve(resizedFile);
              } else {
                resolve(file);
              }
            }, 'image/jpeg', 0.85); // 0.85 is an optimal balance between quality and file size
          } catch (err) {
            console.error('[UploadService] Error preprocessing profile image:', err);
            resolve(file);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  },

  compressImage: async (file: File): Promise<File> => {
    return new Promise((resolve) => {
      if (!file || !file.type || !file.type.startsWith('image/')) {
        resolve(file);
        return;
      }

      // Skip animated GIFs and SVGs to preserve animation and vector quality
      if (file.type === 'image/gif' || file.type.includes('svg')) {
        resolve(file);
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => resolve(file);
      reader.onload = (event) => {
        const img = new Image();
        img.onerror = () => resolve(file);
        img.onload = () => {
          try {
            const maxDimension = 1920;
            let width = img.width;
            let height = img.height;

            // Scale down only if either dimension exceeds maxDimension
            if (width > maxDimension || height > maxDimension) {
              if (width > height) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
              } else {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(file);
              return;
            }

            // High quality image interpolation
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.drawImage(img, 0, 0, width, height);

            let mimeType = file.type;
            let quality: number | undefined = undefined;

            if (file.type === 'image/png') {
              mimeType = 'image/png';
            } else if (file.type === 'image/webp') {
              mimeType = 'image/webp';
              quality = 0.85; // Visually lossless but heavily compressed
            } else {
              mimeType = 'image/jpeg';
              quality = 0.85; // Visually indistinguishable from original, dramatic size reduction
            }

            canvas.toBlob((blob) => {
              if (blob) {
                // Only use the compressed file if it's actually smaller
                if (blob.size < file.size) {
                  const compressedFile = new File([blob], file.name, {
                    type: mimeType,
                    lastModified: Date.now()
                  });
                  console.log(`[UploadService] Compressed image "${file.name}" from ${(file.size / 1024).toFixed(1)} KB to ${(blob.size / 1024).toFixed(1)} KB (Saved ${(((file.size - blob.size) / file.size) * 100).toFixed(1)}%)`);
                  resolve(compressedFile);
                } else {
                  resolve(file);
                }
              } else {
                resolve(file);
              }
            }, mimeType, quality);
          } catch (err) {
            console.error('[UploadService] Error during image compression:', err);
            resolve(file);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  },

  uploadFile: async (file: File, isTemporary: boolean = false): Promise<string> => {
    // Automatically compress image files before uploading
    let processedFile = file;
    if (file && file.type && file.type.startsWith('image/')) {
      processedFile = await uploadService.compressImage(file);
    }

    // Generate a unique filename or use path naming convention
    const timestamp = Date.now();
    const cleanName = processedFile.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const folder = isTemporary ? 'temp' : 'uploads';
    const filePath = `${folder}/${timestamp}_${cleanName}`;
    
    const storageRef = ref(storage, filePath);
    const uploadTask = uploadBytesResumable(storageRef, processedFile);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        null,
        (error) => {
          console.error('[UploadService] Upload failed:', error);
          reject(error);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        }
      );
    });
  }
};
