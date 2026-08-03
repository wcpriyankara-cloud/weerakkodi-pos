import { storage } from '@/lib/firebase';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

export const DEFAULT_IMG =
  'https://placehold.co/200x200/e2e8f0/64748b?text=No+Image';

export const compressImage = (source, maxWidth = 800, quality = 0.82) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width  = maxWidth;
      }
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        quality
      );
    };
    img.onerror = reject;

    if (typeof source === 'string') {
      img.src = source;
    } else if (source instanceof Blob || source instanceof File) {
      const reader = new FileReader();
      reader.onload  = (e) => { img.src = e.target.result; };
      reader.onerror = reject;
      reader.readAsDataURL(source);
    } else {
      reject(new Error('Unsupported source'));
    }
  });

export const uploadImageToStorage = async (source, uid, itemId) => {
  const blob     = await compressImage(source, 800, 0.82);
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const path     = `items/${uid}/${itemId || 'new'}/${filename}`;
  const fileRef  = storageRef(storage, path);
  const snap     = await uploadBytes(fileRef, blob, {
    contentType: 'image/jpeg',
  });
  const url = await getDownloadURL(snap.ref);
  return { url, path };
};

export const deleteImageFromStorage = async (path) => {
  if (!path || typeof path !== 'string') return;
  try {
    await deleteObject(storageRef(storage, path));
  } catch (e) {
    console.warn('Storage delete failed:', e.message);
  }
};

export const getSafeImageUrl = (item) => {
  if (!item) return DEFAULT_IMG;
  const candidates = [
    item.imageUrl,
    item.photoURL,
    item.image,
    ...(Array.isArray(item.images) ? item.images : []),
    item.picture,
  ];
  for (const c of candidates) {
    if (typeof c !== 'string' || !c) continue;
    if (c.startsWith('http') || c.startsWith('data:image')) return c;
  }
  return DEFAULT_IMG;
};