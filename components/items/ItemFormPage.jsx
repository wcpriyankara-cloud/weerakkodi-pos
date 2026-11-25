'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUserAuth } from '@/context/UserContext';
import { db, storage } from '@/lib/firebase';
import {
  collection, addDoc, updateDoc, setDoc, deleteDoc,
  doc, query, where, getDoc, getDocs,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { localDb, ensureDbOpen } from '@/lib/localDb';
import {
  saveItemLocal, getItemLocal, getItemsLocal, deleteItemLocal,
  addToSyncQueue, getSyncQueue,
  cacheRefData, getCachedRefData,
} from '@/lib/offlineDB';
import { processSyncQueue, isOnline } from '@/lib/syncManager';
import SafeItemImage from '@/components/common/SafeItemImage';

/* ══════════════════════════════════════════
   CONSTANTS & PLACEHOLDERS
══════════════════════════════════════════ */
const DEFAULT_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' ry='2'/%3E%3Ccircle cx='9' cy='9' r='2'/%3E%3Cpath d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/%3E%3C/svg%3E";

const WARRANTY_TYPES = [
  { value: '',             label: 'වගකීමක් නැත',    icon: '❌' },
  { value: 'manufacturer', label: 'නිෂ්පාදක වගකීම', icon: '🏭' },
  { value: 'shop',         label: 'සාප්පු වගකීම',   icon: '🏪' },
  { value: 'extended',     label: 'විස්තීරණ වගකීම', icon: '📋' },
  { value: 'limited',      label: 'සීමිත වගකීම',    icon: '⚠️' },
];

const WARRANTY_PERIODS = [
  { label: '7D',   value: '7 days',   desc: 'දින 7'     },
  { label: '1M',   value: '1 month',  desc: 'මාස 1'     },
  { label: '3M',   value: '3 months', desc: 'මාස 3'     },
  { label: '6M',   value: '6 months', desc: 'මාස 6'     },
  { label: '1Y',   value: '1 year',   desc: 'වසර 1'     },
  { label: '2Y',   value: '2 years',  desc: 'වසර 2'     },
  { label: 'Life', value: 'lifetime', desc: 'ජීවිත කාල' },
];

const INITIAL_FORM = {
  id: null,
  itemCode: '', barcode: '', barcodeImage: '',
  name: '', sinhalaName: '', modelKeyCode: '',
  brandId: '', brandName: '',
  categoryId: '', categoryName: '',
  subCategoryId: '', subCategoryName: '',
  uomId: '', uomName: '', availableUnits: [],
  displayUom: '', catalogUom: '', catalogPriceType: 'retail',
  isHidden: false, isPurchaseOnly: false,
  showPrice: true, showDiscount: true,
  allowOrderWhenOutOfStock: false,
  colorId: '', colorName: '',
  rackId: '', rackName: '',
  supplierId: '', supplierName: '',
  currentStock: '', minStockLevel: '', maxStockLevel: '',
  buyingPrice: '',
  sellingPriceRetail: '', retailDiscount: '', retailYourPrice: '',
  sellingPriceWholesale: '', wholesaleDiscount: '', wholesaleYourPrice: '',
  sellingPriceLoose: '', looseDiscount: '', looseYourPrice: '',
  vatEnabled: false, kot: false, description: '',
  images: [], imagePaths: [], picture: '',
  warrantyType: '', warrantyPeriod: '',
  warrantyTerms: '', warrantyNotes: '',
};

const safeTimeout = (promise, ms = 2000, fallbackVal = null) =>
  Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => setTimeout(() => resolve(fallbackVal), ms)),
  ]).catch(() => fallbackVal);

const sanitizeForStorage = (data) => {
  if (!data) return data;
  try {
    return JSON.parse(JSON.stringify(data, (key, value) => {
      if (value && typeof value === 'object') {
        if (typeof value.toDate === 'function') return value.toDate().toISOString();
        if (typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
          return new Date(value.seconds * 1000).toISOString();
        }
      }
      return value;
    }));
  } catch (e) {
    return data;
  }
};

const calcNet = (price, discount) => {
  const p = parseFloat(price || 0);
  const d = parseFloat(discount || 0);
  if (isNaN(p)) return '0.00';
  return (p - (p * d) / 100).toFixed(2);
};

const calcWarrantyExpiry = (period) => {
  if (!period) return '';
  const txt = String(period).toLowerCase().trim();
  if (txt === 'lifetime') return '♾️ ජීවිත කාල';
  const match = txt.match(/^(\d+)\s*(day|days|month|months|year|years|d|m|y)s?$/i);
  if (!match) return '';
  const qty  = parseInt(match[1], 10);
  const unit = match[2].charAt(0).toLowerCase();
  const d    = new Date();
  if (unit === 'd') d.setDate(d.getDate() + qty);
  if (unit === 'm') d.setMonth(d.getMonth() + qty);
  if (unit === 'y') d.setFullYear(d.getFullYear() + qty);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const compressImage = (source, maxWidth = 800, quality = 0.80) =>
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
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas to Blob failed'))),
        'image/jpeg', quality
      );
    };
    img.onerror = () => reject(new Error('Image loading failed'));
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

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      background: type === 'error' ? '#dc2626' : type === 'warning' ? '#d97706' : '#16a34a',
      color: 'white', padding: '14px 20px',
      borderRadius: 12, fontWeight: 700,
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      animation: 'fadeIn 0.3s ease',
      maxWidth: 440,
    }}>
      {message}
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange, color = 'peer-checked:bg-blue-600' }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 pr-3">
        <div className="font-medium text-gray-800 text-sm">{label}</div>
        {desc && <div className="text-[11px] text-gray-400 mt-0.5">{desc}</div>}
      </div>
      <label className="relative inline-flex items-center cursor-pointer shrink-0">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={!!checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className={`relative w-11 h-6 bg-gray-200 rounded-full
          after:content-[''] after:absolute after:top-[2px] after:left-[2px]
          after:bg-white after:border after:rounded-full
          after:h-5 after:w-5 after:transition-all
          peer-checked:after:translate-x-full
          ${color}`}
        />
      </label>
    </div>
  );
}

function ImageUploadSection({ formData, uid, itemId, onImagesChange, isOnlineStatus }) {
  const [uploading, setUploading]           = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileInputRef = useRef(null);

  const uploadToStorage = async (file) => {
    const compressedBlob = await compressImage(file, 800, 0.80);
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const path     = `items/${uid || 'public'}/${itemId || 'new'}/${filename}`;
    const fileRef  = storageRef(storage, path);
    const snap     = await uploadBytes(fileRef, compressedBlob, { contentType: 'image/jpeg' });
    const url      = await getDownloadURL(snap.ref);
    return { url, path };
  };

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    const newImages = [];
    const newPaths  = [];
    for (let i = 0; i < files.length; i++) {
      setUploadProgress(`පින්තූර සකසමින්... ${i + 1}/${files.length}`);
      try {
        if (isOnlineStatus && storage) {
          const { url, path } = await uploadToStorage(files[i]);
          newImages.push(url);
          newPaths.push(path);
        } else {
          const compressedBlob = await compressImage(files[i], 500, 0.70);
          const base64 = await blobToBase64(compressedBlob);
          newImages.push(base64);
          newPaths.push(`offline_${Date.now()}_${i}`);
        }
      } catch (err) {
        console.warn('Storage upload fallback to base64:', err?.message);
        try {
          const compressedBlob = await compressImage(files[i], 500, 0.70);
          const base64 = await blobToBase64(compressedBlob);
          newImages.push(base64);
          newPaths.push(`offline_fallback_${Date.now()}_${i}`);
        } catch (e2) {
          console.error('Image processing failed:', e2?.message);
        }
      }
    }
    const updatedImages = [...(formData.images || []), ...newImages];
    const updatedPaths  = [...(formData.imagePaths || []), ...newPaths];
    onImagesChange({
      images: updatedImages,
      imagePaths: updatedPaths,
      picture: updatedImages[0] || '',
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploading(false);
    setUploadProgress('');
  };

  const removeImage = async (idx) => {
    const imgs  = [...(formData.images || [])];
    const paths = [...(formData.imagePaths || [])];
    if (paths[idx] && isOnlineStatus && !paths[idx].startsWith('offline_') && storage) {
      try { await deleteObject(storageRef(storage, paths[idx])); } catch {}
    }
    imgs.splice(idx, 1);
    paths.splice(idx, 1);
    onImagesChange({
      images: imgs,
      imagePaths: paths,
      picture: imgs[0] || '',
    });
  };

  const setAsMainImage = (idx) => {
    if (idx === 0) return;
    const imgs = [...(formData.images || [])];
    const paths = [...(formData.imagePaths || [])];
    const targetImg = imgs.splice(idx, 1)[0];
    const targetPath = paths.splice(idx, 1)[0];
    imgs.unshift(targetImg);
    paths.unshift(targetPath);
    onImagesChange({
      images: imgs,
      imagePaths: paths,
      picture: imgs[0] || '',
    });
  };

  const safeImages = (formData.images || []).filter(Boolean);

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border">
      <div className="flex justify-between items-center mb-3">
        <label className="block font-bold text-gray-800 text-sm">📷 භාණ්ඩයේ පින්තූර (Images)</label>
        <span className="text-xs text-gray-500">පළමු රූපය Main Image එක වේ</span>
      </div>
      {safeImages.length > 0 ? (
        <div className="flex overflow-x-auto gap-3 pb-3 mb-3">
          {safeImages.map((img, idx) => (
            <div key={idx} className="relative shrink-0 group" style={{ minWidth: 110 }}>
              <div
                onClick={() => setAsMainImage(idx)}
                className={`w-28 h-28 border-2 rounded-xl overflow-hidden bg-gray-50 cursor-pointer transition-all ${
                  idx === 0 ? 'border-blue-600 ring-2 ring-blue-300' : 'border-gray-200 hover:border-gray-400'
                }`}
                title="ප්‍රධාන රූපය බවට පත් කිරීමට click කරන්න"
              >
                <SafeItemImage
                  src={img}
                  className="w-full h-full object-cover"
                  fallbackClassName="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400"
                />
              </div>
              {idx === 0 ? (
                <span className="absolute bottom-1 left-1 bg-blue-600 text-white text-[9px] px-2 py-0.5 rounded-md font-bold shadow">
                  ⭐ Main
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setAsMainImage(idx)}
                  className="absolute bottom-1 left-1 bg-black/60 text-white text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Set Main
                </button>
              )}
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-md hover:bg-red-700"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl h-32 flex flex-col items-center justify-center mb-3 bg-gray-50 text-gray-400 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors"
        >
          <div className="text-3xl mb-1">📷</div>
          <div className="text-sm font-bold text-gray-600">පින්තූරයක් එක් කිරීමට මෙතැන ඔබන්න</div>
          <div className="text-[11px] text-gray-400 mt-0.5">JPG, PNG, WEBP (උපරිම 5MB)</div>
        </div>
      )}
      {uploading && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-blue-700 text-sm font-bold">{uploadProgress}</span>
        </div>
      )}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full bg-blue-50 text-blue-700 border-2 border-blue-200 py-3 rounded-xl font-bold hover:bg-blue-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        <span>📁 ගැලරියෙන් පින්තූර තෝරන්න (Select Images)</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(Array.from(e.target.files || []))}
      />
    </div>
  );
}

function SmartSelectWithManage({
  label, icon = '📋', value, displayValue, options,
  onSelect, collectionName, uid, showToast,
  colorPicker = false,
  parentFilter = null,
  parentRequired = false,
  parentLabel = '',
  extraFields = [],
}) {
  const [isOpen, setIsOpen]             = useState(false);
  const [search, setSearch]             = useState('');
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [editItem, setEditItem]         = useState(null);
  const [editName, setEditName]         = useState('');
  const [editColor, setEditColor]       = useState('#3b82f6');
  const [editExtras, setEditExtras]     = useState({});
  const [isSaving, setIsSaving]         = useState(false);
  const [isDeleting, setIsDeleting]     = useState(null);
  const ref = useRef(null);

  const filteredByParent = parentFilter
    ? (options || []).filter(o => o && o[parentFilter.field] === parentFilter.value)
    : (options || []);

  const filtered = filteredByParent.filter((opt) =>
    (opt?.name || '').toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false); setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleAdd = async (nameToAdd) => {
    if (!nameToAdd?.trim()) return null;
    const effectiveUid = uid || 'local_user';
    setIsSaving(true);
    try {
      const newDoc = { name: nameToAdd.trim(), uid: effectiveUid, createdAt: new Date().toISOString() };
      if (colorPicker) newDoc.color = editColor;
      if (parentFilter) newDoc[parentFilter.field] = parentFilter.value;
      extraFields.forEach(ef => { if (editExtras[ef.key]) newDoc[ef.key] = editExtras[ef.key]; });

      try {
        const hasTable = localDb?.isOpen?.() && localDb.tables?.some(t => t.name === collectionName);
        if (hasTable) {
          await localDb.table(collectionName).put({ ...newDoc, id: `loc_${Date.now()}` }).catch(() => {});
        }
      } catch (_) {}

      if (isOnline() && db) {
        try {
          const docRef = await addDoc(collection(db, collectionName), newDoc);
          showToast?.(`✅ "${nameToAdd.trim()}" එක් කරන ලදී`);
          return docRef.id;
        } catch (cloudErr) {
          console.warn('Cloud ref add skipped (Quota limit):', cloudErr?.message);
        }
      }
      const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await addToSyncQueue(effectiveUid, 'add', collectionName, newDoc, localId);
      showToast?.(`💾 "${nameToAdd.trim()}" Local Hard Disk එකට සුරකින ලදී`);
      return localId;
    } catch (e) {
      showToast?.('❌ Error: ' + e.message, 'error');
      return null;
    } finally { setIsSaving(false); }
  };

  const handleQuickAdd = async (e) => {
    e?.preventDefault();
    if (!search.trim()) return;
    const newId = await handleAdd(search.trim());
    if (newId) { onSelect(newId, search.trim()); setIsOpen(false); setSearch(''); }
  };

  const handleUpdate = async () => {
    if (!editItem || !editName.trim()) return;
    const effectiveUid = uid || 'local_user';
    setIsSaving(true);
    try {
      const updateData = { name: editName.trim(), updatedAt: new Date().toISOString() };
      if (colorPicker) updateData.color = editColor;
      extraFields.forEach(ef => { if (editExtras[ef.key] !== undefined) updateData[ef.key] = editExtras[ef.key]; });

      const hasTable = localDb?.isOpen?.() && localDb.tables?.some(t => t.name === collectionName);
      if (hasTable) {
        try { await localDb.table(collectionName).update(editItem.id, updateData); } catch (_) {}
      }
      if (isOnline() && db && !String(editItem.id).startsWith('local_') && !String(editItem.id).startsWith('loc_')) {
        try {
          await updateDoc(doc(db, collectionName, editItem.id), updateData);
        } catch (_) {}
      } else {
        await addToSyncQueue(effectiveUid, 'update', collectionName, updateData, editItem.id);
      }
      if (value === editItem.id) onSelect(editItem.id, editName.trim());
      showToast?.(`✅ "${editName.trim()}" යාවත්කාලීන කරන ලදී`);
      setEditItem(null); setEditName(''); setEditExtras({});
    } catch (e) {
      showToast?.('❌ Error: ' + e.message, 'error');
    } finally { setIsSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!confirm(`"${item.name}" මකා දැමීමට අවශ්‍යද?`)) return;
    const effectiveUid = uid || 'local_user';
    setIsDeleting(item.id);
    try {
      const hasTable = localDb?.isOpen?.() && localDb.tables?.some(t => t.name === collectionName);
      if (hasTable) {
        try { await localDb.table(collectionName).delete(item.id); } catch (_) {}
      }
      if (isOnline() && db && !String(item.id).startsWith('local_') && !String(item.id).startsWith('loc_')) {
        try { await deleteDoc(doc(db, collectionName, item.id)); } catch (_) {}
      } else {
        await addToSyncQueue(effectiveUid, 'delete', collectionName, {}, item.id);
      }
      if (value === item.id) onSelect('', '');
      showToast?.(`🗑️ "${item.name}" මකා දමන ලදී`);
    } catch (e) {
      showToast?.('❌ Error: ' + e.message, 'error');
    } finally { setIsDeleting(null); }
  };

  const startEdit = (item) => {
    setEditItem(item); setEditName(item.name || '');
    setEditColor(item.color || '#3b82f6');
    const extras = {};
    extraFields.forEach(ef => { extras[ef.key] = item[ef.key] || ''; });
    setEditExtras(extras);
  };

  const parentMissing = parentRequired && parentFilter && !parentFilter.value;

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-bold text-gray-800">{icon} {label}</label>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (parentMissing) { showToast?.(`කරුණාකර පළමුව ${parentLabel} තෝරන්න`, 'error'); return; }
            setIsManageOpen(true);
          }}
          className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg font-bold hover:bg-indigo-200"
        >
          ⚙️ කළමනාකරණය
        </button>
      </div>
      <div
        onClick={() => {
          if (parentMissing) { showToast?.(`කරුණාකර පළමුව ${parentLabel} තෝරන්න`, 'error'); return; }
          setIsOpen(!isOpen);
        }}
        className={`border-2 p-3 rounded-xl bg-white cursor-pointer flex justify-between items-center shadow-sm
          hover:border-blue-400 ${parentMissing ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {colorPicker && value && (() => {
            const sel = (options || []).find(o => o && o.id === value);
            return sel?.color ? <div className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0" style={{ backgroundColor: sel.color }} /> : null;
          })()}
          <span className={`truncate ${value ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
            {value ? ((options || []).find(o => o && o.id === value)?.name || displayValue || 'Selected')
              : parentMissing ? `පළමුව ${parentLabel} තෝරන්න` : 'තෝරන්න හෝ ටයිප් කර එක් කරන්න...'}
          </span>
        </div>
        <span className={`text-gray-500 transition-transform shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </div>
      {isOpen && !parentMissing && (
        <div className="absolute z-30 w-full bg-white border-2 border-gray-200 mt-1 shadow-2xl max-h-72 overflow-hidden rounded-xl">
          <div className="sticky top-0 bg-white border-b">
            <input
              autoFocus
              className="w-full p-3 outline-none text-gray-900 bg-gray-50 text-sm"
              placeholder="🔍 සොයන්න හෝ නව නමක් ටයිප් කරන්න..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === 'Enter' && search && filtered.length === 0) handleQuickAdd(e); }}
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {value && (
              <div
                onMouseDown={(e) => { e.preventDefault(); onSelect('', ''); setIsOpen(false); }}
                className="p-3 hover:bg-red-50 cursor-pointer border-b text-red-600 font-medium flex items-center gap-2 text-sm"
              >
                ✕ ඉවත් කරන්න
              </div>
            )}
            {filtered.map((opt) => (
              <div
                key={opt.id}
                onMouseDown={(e) => { e.preventDefault(); onSelect(opt.id, opt.name); setIsOpen(false); setSearch(''); }}
                className={`p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 flex items-center gap-2 text-sm
                  ${value === opt.id ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-800'}`}
              >
                {colorPicker && opt.color && <div className="w-4 h-4 rounded-full border shrink-0" style={{ backgroundColor: opt.color }} />}
                <span className="flex-1">{opt.name}</span>
                {value === opt.id && <span className="font-bold text-blue-600">✓</span>}
              </div>
            ))}
            {search && filtered.length === 0 && (
              <div
                onMouseDown={handleQuickAdd}
                className="p-3 bg-green-50 text-green-700 font-bold cursor-pointer hover:bg-green-100 flex justify-between items-center text-sm"
              >
                <span>➕ "{search}" එක් කරන්න</span>
                {isSaving && <span className="animate-spin">⏳</span>}
              </div>
            )}
            {!search && filtered.length === 0 && (
              <div className="p-4 text-center text-gray-400 text-sm">දත්ත නොමැත. ⚙️ කළමනාකරණය තුළින් එක් කරන්න</div>
            )}
          </div>
        </div>
      )}
      {isManageOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => { setIsManageOpen(false); setEditItem(null); }}>
          <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white flex items-center justify-between">
              <h2 className="font-bold text-lg">{icon} {label} කළමනාකරණය</h2>
              <button onClick={() => { setIsManageOpen(false); setEditItem(null); }} className="bg-white/20 rounded-full w-8 h-8 font-bold">✕</button>
            </div>
            <div className="p-4 border-b bg-gray-50">
              <div className="flex gap-2">
                <input
                  className="flex-1 border-2 border-gray-200 p-3 rounded-xl text-sm font-medium outline-none focus:border-indigo-400"
                  placeholder={`නව ${label} නමක්...`}
                  value={editItem ? '' : search}
                  onChange={(e) => { if (!editItem) setSearch(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !editItem && search.trim()) handleAdd(search.trim()).then(id => { if (id) setSearch(''); }); }}
                  disabled={!!editItem}
                />
                <button
                  type="button"
                  onClick={() => { if (!editItem && search.trim()) handleAdd(search.trim()).then(id => { if (id) setSearch(''); }); }}
                  disabled={isSaving || !editItem && !search.trim()}
                  className="bg-indigo-600 text-white px-4 rounded-xl font-bold disabled:opacity-50 shrink-0"
                >
                  {isSaving ? '⏳' : '➕'}
                </button>
              </div>
            </div>
            {editItem && (
              <div className="p-4 border-b bg-amber-50">
                <span className="text-amber-800 font-bold text-xs block mb-2">✏️ සංස්කරණය: {editItem.name}</span>
                <input
                  className="w-full border-2 border-amber-300 p-3 rounded-xl text-sm font-bold outline-none bg-white"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(); }}
                  autoFocus
                />
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => { setEditItem(null); setEditName(''); }} className="flex-1 bg-gray-200 py-2 rounded-xl font-bold text-sm">✕ අවලංගු</button>
                  <button type="button" onClick={handleUpdate} disabled={isSaving || !editName.trim()} className="flex-1 bg-amber-500 text-white py-2 rounded-xl font-bold text-sm disabled:opacity-50">
                    {isSaving ? '⏳' : '✅ සුරකින්න'}
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              {filteredByParent.length === 0 ? (
                <div className="p-8 text-center text-gray-400">දත්ත නොමැත</div>
              ) : filteredByParent.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 border-b hover:bg-gray-50">
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">{idx + 1}</div>
                  <div className="flex-1 min-w-0 cursor-pointer font-medium text-gray-800" onClick={() => { onSelect(item.id, item.name); setIsManageOpen(false); }}>
                    {item.name}
                  </div>
                  {value === item.id && <span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">තෝරා ඇත</span>}
                  <button type="button" onClick={() => startEdit(item)} className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">✏️</button>
                  <button type="button" onClick={() => handleDelete(item)} disabled={isDeleting === item.id} className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center">🗑️</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UomSmartSelect({ value, displayValue, uoms, onSelect, uid, showToast }) {
  const [isOpen, setIsOpen]             = useState(false);
  const [search, setSearch]             = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUomName, setNewUomName]     = useState('');
  const [newUomSymbol, setNewUomSymbol] = useState('');
  const [conversions, setConversions]   = useState([]);
  const [isSaving, setIsSaving]         = useState(false);
  const ref = useRef(null);

  const selectedUom = (uoms || []).find(u => u && u.id === value);
  const filtered = (uoms || []).filter(u =>
    (u?.fromUnitName || '').toLowerCase().includes(search.toLowerCase()) ||
    (u?.symbol || '').toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false); setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openCreate = () => { setNewUomName(''); setNewUomSymbol(''); setConversions([]); setIsCreateOpen(true); };

  const saveNewUom = async () => {
    if (!newUomName.trim()) { showToast?.('කරුණාකර මිනුම් නම ඇතුළත් කරන්න', 'error'); return; }
    const effectiveUid = uid || 'local_user';
    setIsSaving(true);
    try {
      const validConversions = conversions.filter(c => c.toUnitName?.trim() && c.rate).map(c => ({ toUnitName: c.toUnitName.trim(), rate: Number(c.rate) || 1, symbol: c.symbol || '' }));
      const uomData = { fromUnitName: newUomName.trim(), symbol: newUomSymbol.trim(), conversions: validConversions, uid: effectiveUid, createdAt: new Date().toISOString() };
      
      const hasTable = localDb?.isOpen?.() && localDb.tables?.some(t => t.name === 'uoms');
      if (hasTable) {
        try { await localDb.table('uoms').put({ ...uomData, id: `uom_${Date.now()}` }).catch(() => {}); } catch (_) {}
      }

      if (isOnline() && db) {
        try {
          const docRef = await addDoc(collection(db, 'uoms'), uomData);
          showToast?.(`✅ "${newUomName.trim()}" UOM එක් කරන ලදී`);
          onSelect(docRef.id, newUomName.trim(), validConversions);
          setIsCreateOpen(false);
          return;
        } catch (_) {}
      }

      const localId = `local_${Date.now()}`;
      await addToSyncQueue(effectiveUid, 'add', 'uoms', uomData, localId);
      showToast?.(`💾 "${newUomName.trim()}" Local Hard Disk එකට සුරකින ලදී`);
      onSelect(localId, newUomName.trim(), validConversions);
      setIsCreateOpen(false);
    } catch (e) { showToast?.('❌ Error: ' + e.message, 'error'); }
    finally { setIsSaving(false); }
  };

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-bold text-gray-800">📐 මූලික මිනුම් සැකසුම (Base UOM)</label>
        <button type="button" onClick={openCreate} className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded-lg font-bold hover:bg-teal-200">➕ නව UOM</button>
      </div>
      <div onClick={() => setIsOpen(!isOpen)} className="border-2 p-3 rounded-xl bg-white cursor-pointer flex justify-between items-center shadow-sm hover:border-blue-400">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {selectedUom && <span className="bg-teal-100 text-teal-700 text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0">{selectedUom.symbol || selectedUom.fromUnitName?.slice(0, 3)}</span>}
          <span className={`truncate ${value ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{value ? (selectedUom?.fromUnitName || displayValue || 'Selected') : 'මිනුම් ක්‍රමය තෝරන්න...'}</span>
        </div>
        <span className={`text-gray-500 transition-transform shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </div>
      {isOpen && (
        <div className="absolute z-30 w-full bg-white border-2 border-gray-200 mt-1 shadow-2xl max-h-72 overflow-hidden rounded-xl">
          <div className="sticky top-0 bg-white border-b">
            <input autoFocus className="w-full p-3 outline-none text-gray-900 bg-gray-50 text-sm" placeholder="🔍 UOM සොයන්න..." value={search} onChange={(e) => setSearch(e.target.value)} onClick={(e) => e.stopPropagation()} />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {value && <div onMouseDown={(e) => { e.preventDefault(); onSelect('', '', []); setIsOpen(false); }} className="p-3 hover:bg-red-50 cursor-pointer border-b text-red-600 font-medium text-sm">✕ ඉවත් කරන්න</div>}
            {filtered.map(uom => (
              <div key={uom.id} onMouseDown={(e) => { e.preventDefault(); onSelect(uom.id, uom.fromUnitName, uom.conversions || []); setIsOpen(false); setSearch(''); }}
                className={`p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 text-sm ${value === uom.id ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-800'}`}>
                <span className="font-bold">{uom.fromUnitName}</span> {uom.symbol && <span className="text-gray-500 text-xs">({uom.symbol})</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={() => setIsCreateOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-teal-600 p-4 text-white font-bold flex justify-between items-center">
              <span>➕ නව UOM නිර්මාණය</span>
              <button onClick={() => setIsCreateOpen(false)}>✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">නම (උදා: Piece, Box, Kg)</label>
                <input className="w-full border p-2 rounded-lg text-sm" value={newUomName} onChange={e => setNewUomName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">සංකේතය (උදා: pcs, box, kg)</label>
                <input className="w-full border p-2 rounded-lg text-sm" value={newUomSymbol} onChange={e => setNewUomSymbol(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="flex-1 bg-gray-200 py-2 rounded-xl font-bold text-sm">✕ අවලංගු</button>
                <button type="button" onClick={saveNewUom} disabled={isSaving || !newUomName.trim()} className="flex-1 bg-teal-600 text-white py-2 rounded-xl font-bold text-sm disabled:opacity-50">
                  {isSaving ? '⏳' : '💾 සුරකින්න'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemFormContent({ mode: propMode, itemId: propItemId, id: directId, onSuccess, onCancel }) {
  const { user } = useUserAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawParamId = searchParams?.get('id') || searchParams?.get('itemId') || '';
  const resolvedItemId = (directId || propItemId || rawParamId || '').trim() || null;
  const isEditMode = propMode === 'edit' || Boolean(resolvedItemId);

  const [formData, setFormData]         = useState(INITIAL_FORM);
  const [loading, setLoading]           = useState(Boolean(isEditMode && resolvedItemId));
  const [saving, setSaving]             = useState(false);
  const [toast, setToast]               = useState(null);
  const [activeTab, setActiveTab]       = useState('basic');
  const [online, setOnline]             = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncing, setSyncing]           = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const [brands,        setBrands]        = useState([]);
  const [categories,    setCategories]    = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [uoms,          setUoms]          = useState([]);
  const [colors,        setColors]        = useState([]);
  const [racks,         setRacks]         = useState([]);
  const [suppliers,     setSuppliers]     = useState([]);

  const loadedIdRef   = useRef(null);
  const isFetchingRef = useRef(false);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    const onOn = async () => {
      setOnline(true);
      if (user?.uid) {
        setSyncing(true);
        try {
          await processSyncQueue(user.uid);
          const queue = await getSyncQueue(user.uid);
          setPendingCount((queue || []).filter(q => !q.processed).length);
        } catch (e) {
          console.warn('Sync notice:', e?.message);
        } finally {
          setSyncing(false);
        }
      }
    };
    const onOff = () => {
      setOnline(false);
      showToast('🔴 Offline — දත්ත PC Hard Disk එකට සුරැකේ', 'warning');
    };
    window.addEventListener('online', onOn);
    window.addEventListener('offline', onOff);
    return () => {
      window.removeEventListener('online', onOn);
      window.removeEventListener('offline', onOff);
    };
  }, [user?.uid, showToast]);

  useEffect(() => {
    let isMounted = true;
    const effectiveUid = user?.uid || 'all';
    const loadRefData = async () => {
      const collections = [
        { name: 'brands',        setter: setBrands },
        { name: 'categories',    setter: setCategories },
        { name: 'subCategories', setter: setSubCategories },
        { name: 'uoms',          setter: setUoms },
        { name: 'colors',        setter: setColors },
        { name: 'racks',         setter: setRacks },
        { name: 'suppliers',     setter: setSuppliers },
      ];

      for (const col of collections) {
        try {
          const hasTable = localDb?.isOpen?.() && localDb.tables?.some(t => t.name === col.name);
          if (hasTable) {
            const localList = await localDb.table(col.name).toArray().catch(() => []);
            if (isMounted && Array.isArray(localList) && localList.length > 0) {
              col.setter(localList);
              continue;
            }
          }
        } catch (_) {}

        try {
          const cached = (await getCachedRefData(col.name, effectiveUid)) || (await getCachedRefData(effectiveUid, col.name));
          if (isMounted && Array.isArray(cached) && cached.length > 0) {
            col.setter(cached);
            continue;
          }
        } catch (_) {}

        if (isOnline() && db && user?.uid) {
          try {
            const q = query(collection(db, col.name), where('uid', '==', user.uid));
            safeTimeout(getDocs(q), 1500, null).then((snap) => {
              if (!isMounted || !snap) return;
              const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
              if (items.length > 0) {
                col.setter(items);
                cacheRefData(col.name, user.uid, items).catch(() => {});
                const hasTable = localDb?.isOpen?.() && localDb.tables?.some(t => t.name === col.name);
                if (hasTable) {
                  localDb.table(col.name).bulkPut(items).catch(() => {});
                }
              }
            }).catch(() => {});
          } catch (_) {}
        }
      }
    };
    loadRefData();
    return () => { isMounted = false; };
  }, [user?.uid]);

  // Master safety timeout (Prevents infinite spinner)
  useEffect(() => {
    const masterTimer = setTimeout(() => {
      setLoading(false);
    }, 2000);
    return () => clearTimeout(masterTimer);
  }, [resolvedItemId]);

  // 1. Zero-Freeze PC Hard Disk First Load Item
  useEffect(() => {
    if (!isEditMode || !resolvedItemId) {
      setLoading(false);
      return;
    }
    if (loadedIdRef.current === resolvedItemId) {
      setLoading(false);
      return;
    }
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    let isMounted = true;

    const loadItemSafe = async () => {
      setLoading(true);
      try {
        let rawData = null;

        // TIER 1: PC Hard Disk (Dexie WeerakkodiPOS_DB)
        try {
          const isReady = await safeTimeout(ensureDbOpen(), 1000, false);
          if (isReady && localDb && typeof localDb.isOpen === 'function' && localDb.isOpen() && localDb.items) {
            // Direct ID lookups
            rawData = await safeTimeout(localDb.items.get(String(resolvedItemId)), 1000, null);
            if (!rawData) {
              rawData = await safeTimeout(localDb.items.get(resolvedItemId), 800, null);
            }
            if (!rawData && !isNaN(Number(resolvedItemId))) {
              rawData = await safeTimeout(localDb.items.get(Number(resolvedItemId)), 800, null);
            }

            // In-memory scan for legacy & unindexed fields
            if (!rawData) {
              const allLocal = await safeTimeout(localDb.items.toArray(), 1200, []);
              if (Array.isArray(allLocal) && allLocal.length > 0) {
                const targetStr = String(resolvedItemId).trim().toLowerCase();
                rawData = allLocal.find(i => {
                  if (!i) return false;
                  return (
                    (i.id != null && String(i.id).trim().toLowerCase() === targetStr) ||
                    (i.firestoreId != null && String(i.firestoreId).trim().toLowerCase() === targetStr) ||
                    (i.localId != null && String(i.localId).trim().toLowerCase() === targetStr) ||
                    (i._id != null && String(i._id).trim().toLowerCase() === targetStr) ||
                    (i.itemCode != null && String(i.itemCode).trim().toLowerCase() === targetStr) ||
                    (i.barcode != null && String(i.barcode).trim().toLowerCase() === targetStr)
                  );
                });
              }
            }
          }
        } catch (dexErr) {
          console.warn('[ItemForm] Dexie local fetch notice:', dexErr?.message);
        }

        // TIER 2: Raw IndexedDB Fallback
        if (!rawData) {
          try {
            if (typeof getItemLocal === 'function') {
              rawData = await safeTimeout(getItemLocal(resolvedItemId), 800, null);
            }
            if (!rawData && typeof getItemsLocal === 'function') {
              const localList = await safeTimeout(getItemsLocal(user?.uid || 'all'), 800, []);
              if (Array.isArray(localList) && localList.length > 0) {
                const targetStr = String(resolvedItemId).trim().toLowerCase();
                rawData = localList.find(i => {
                  if (!i) return false;
                  return (
                    (i.id != null && String(i.id).trim().toLowerCase() === targetStr) ||
                    (i.firestoreId != null && String(i.firestoreId).trim().toLowerCase() === targetStr) ||
                    (i.localId != null && String(i.localId).trim().toLowerCase() === targetStr) ||
                    (i._id != null && String(i._id).trim().toLowerCase() === targetStr) ||
                    (i.itemCode != null && String(i.itemCode).trim().toLowerCase() === targetStr) ||
                    (i.barcode != null && String(i.barcode).trim().toLowerCase() === targetStr)
                  );
                });
              }
            }
          } catch (offErr) {
            console.warn('[ItemForm] offlineDB fallback notice:', offErr?.message);
          }
        }

        // TIER 3: Cloud Firestore Fallback (If not found on Hard Disk)
        if (!rawData && isOnline() && db && !String(resolvedItemId).startsWith('local_') && !String(resolvedItemId).startsWith('itm_')) {
          try {
            const snap = await safeTimeout(getDoc(doc(db, 'items', resolvedItemId)), 1200, null);
            if (snap?.exists()) {
              rawData = { id: snap.id, ...snap.data() };
              try {
                if (localDb && typeof localDb.isOpen === 'function' && localDb.isOpen() && localDb.items) {
                  localDb.items.put(sanitizeForStorage(rawData)).catch(() => {});
                }
              } catch (_) {}
            }
          } catch (cloudErr) {
            console.warn('[ItemForm] Cloud fetch notice:', cloudErr?.message);
          }
        }

        if (!isMounted) return;

        if (rawData) {
          loadedIdRef.current = resolvedItemId;
          const data = sanitizeForStorage(rawData);

          const retailPrice = data.sellingPriceRetail ?? data.sellingPrice ?? data.retailPrice ?? data.price ?? '';
          const wholesalePrice = data.sellingPriceWholesale ?? data.wholesalePrice ?? '';
          const loosePrice = data.sellingPriceLoose ?? data.loosePrice ?? '';
          const buyPrice = data.buyingPrice ?? data.costPrice ?? data.cost ?? '';
          const stockVal = data.currentStock ?? data.stock ?? data.quantity ?? '';

          setFormData({
            ...INITIAL_FORM,
            ...data,
            id: resolvedItemId,
            name: data.name || '',
            sinhalaName: data.sinhalaName || '',
            itemCode: data.itemCode || '',
            barcode: data.barcode || '',
            brandId: data.brandId || '',
            brandName: data.brandName || '',
            categoryId: data.categoryId || '',
            categoryName: data.categoryName || '',
            subCategoryId: data.subCategoryId || '',
            subCategoryName: data.subCategoryName || '',
            uomId: data.uomId || '',
            uomName: data.uomName || '',
            availableUnits: Array.isArray(data.availableUnits) ? data.availableUnits : [],
            displayUom: data.displayUom || data.catalogUom || data.uomName || '',
            currentStock: stockVal !== '' ? String(stockVal) : '',
            minStockLevel: data.minStockLevel !== undefined ? String(data.minStockLevel) : '',
            maxStockLevel: data.maxStockLevel !== undefined ? String(data.maxStockLevel) : '',
            buyingPrice: buyPrice !== '' ? String(buyPrice) : '',
            sellingPriceRetail: retailPrice !== '' ? String(retailPrice) : '',
            retailDiscount: data.retailDiscount !== undefined ? String(data.retailDiscount) : '',
            retailYourPrice: data.retailYourPrice || calcNet(retailPrice, data.retailDiscount),
            sellingPriceWholesale: wholesalePrice !== '' ? String(wholesalePrice) : '',
            wholesaleDiscount: data.wholesaleDiscount !== undefined ? String(data.wholesaleDiscount) : '',
            wholesaleYourPrice: data.wholesaleYourPrice || calcNet(wholesalePrice, data.wholesaleDiscount),
            sellingPriceLoose: loosePrice !== '' ? String(loosePrice) : '',
            looseDiscount: data.looseDiscount !== undefined ? String(data.looseDiscount) : '',
            looseYourPrice: data.looseYourPrice || calcNet(loosePrice, data.looseDiscount),
            images: Array.isArray(data.images) && data.images.length > 0 ? data.images : (data.picture ? [data.picture] : []),
            imagePaths: Array.isArray(data.imagePaths) ? data.imagePaths : [],
            picture: data.picture || (Array.isArray(data.images) ? data.images[0] : '') || '',
          });
        } else {
          showToast('⚠️ භාණ්ඩ විස්තර Local Hard Disk එකෙන් සොයාගත නොහැකි විය', 'warning');
        }
      } catch (e) {
        console.warn('[ItemForm] Load item error:', e?.message);
      } finally {
        isFetchingRef.current = false;
        if (isMounted) setLoading(false);
      }
    };

    loadItemSafe();
    return () => {
      isMounted = false;
      isFetchingRef.current = false;
    };
  }, [isEditMode, resolvedItemId, showToast]);

  const updateField = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const updateFields = useCallback((updates) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  const handleGenerateBarcode = () => {
    const randomBarcode = `${Date.now().toString().slice(-8)}${Math.floor(1000 + Math.random() * 9000)}`;
    updateField('barcode', randomBarcode);
    showToast(`⚡ Barcode එකක් සෑදිණි: ${randomBarcode}`);
  };

  // 2. GUARANTEED DUAL SAVE (PC Hard Disk + Cloud Firestore)
  const handleSave = async () => {
    if (!formData.name?.trim()) {
      showToast('කරුණාකර භාණ්ඩයේ නම ඇතුළත් කරන්න', 'error');
      return;
    }

    const effectiveUid = user?.uid || 'local_user';
    setSaving(true);

    try {
      const primaryPic = (formData.images && formData.images.length > 0)
        ? formData.images[0]
        : (formData.picture || '');

      let targetId = resolvedItemId;
      if (!isEditMode || !targetId) {
        try {
          if (db) {
            const autoDocRef = doc(collection(db, 'items'));
            targetId = autoDocRef.id;
          } else {
            targetId = `itm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          }
        } catch {
          targetId = `itm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        }
      }

      const stockVal  = parseFloat(formData.currentStock) || 0;
      const sellPrice = parseFloat(formData.sellingPriceRetail) || 0;
      const buyPrice  = parseFloat(formData.buyingPrice) || 0;

      const rawPayload = {
        ...formData,
        id: String(targetId),
        localId: String(targetId),
        firestoreId: !String(targetId).startsWith('local_') && !String(targetId).startsWith('itm_') ? String(targetId) : (formData.firestoreId || targetId),
        uid: effectiveUid,
        name: formData.name.trim(),
        sinhalaName: formData.sinhalaName?.trim() || '',
        itemCode: formData.itemCode?.trim() || '',
        barcode: formData.barcode?.trim() || '',
        picture: primaryPic,
        images: formData.images || [],
        imagePaths: formData.imagePaths || [],
        displayUom: formData.displayUom || formData.uomName || '',
        catalogUom: formData.displayUom || formData.uomName || '',
        sellingPrice: sellPrice,
        sellingPriceRetail: sellPrice,
        costPrice: buyPrice,
        buyingPrice: buyPrice,
        sellingPriceWholesale: parseFloat(formData.sellingPriceWholesale) || 0,
        sellingPriceLoose: parseFloat(formData.sellingPriceLoose) || 0,
        stock: stockVal,
        currentStock: stockVal,
        quantity: stockVal,
        minStockLevel: parseFloat(formData.minStockLevel) || 0,
        maxStockLevel: parseFloat(formData.maxStockLevel) || 0,
        updatedAt: new Date().toISOString(),
      };

      if (!isEditMode) {
        rawPayload.createdAt = formData.createdAt || new Date().toISOString();
      }

      const cleanPayload = sanitizeForStorage(rawPayload);

      // 💾 ස්ථාන 1: PC HARD DISK එකට SAVE කිරීම (Dexie DB + OfflineDB)
      try {
        const isReady = await safeTimeout(ensureDbOpen(), 800, false);
        if (isReady && localDb && typeof localDb.isOpen === 'function' && localDb.isOpen() && localDb.items) {
          await localDb.items.put({
            ...cleanPayload,
            synced: 0,
            _synced: 0,
            _sync: 'pending',
          });
        }
      } catch (dexPutErr) {
        console.warn('[ItemForm] localDb write notice:', dexPutErr?.message);
      }

      try {
        await saveItemLocal(effectiveUid, cleanPayload, targetId);
      } catch (offPutErr) {
        console.warn('[ItemForm] offlineDB write notice:', offPutErr?.message);
      }

      // 🌐 ස්ථාන 2: CLOUD FIRESTORE වෙත SAVE කිරීම (Quota Safe 2000ms Race)
      let cloudSaved = false;
      if (isOnline() && db) {
        try {
          const firestorePayload = { ...cleanPayload };
          delete firestorePayload.id;
          const firestoreDocRef = doc(db, 'items', targetId);
          const TIMEOUT_SENTINEL = Symbol('timeout');
          const savePromise = setDoc(firestoreDocRef, firestorePayload, { merge: true });
          const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(TIMEOUT_SENTINEL), 2000));
          const result = await Promise.race([savePromise, timeoutPromise]);

          if (result !== TIMEOUT_SENTINEL) {
            cloudSaved = true;
            try {
              if (localDb && typeof localDb.isOpen === 'function' && localDb.isOpen() && localDb.items) {
                await localDb.items.update(targetId, { synced: 1, _synced: 1, _sync: 'synced' });
              }
            } catch (_) {}
          }
        } catch (cloudErr) {
          console.warn('[ItemForm] Firestore save rate-limited or quota exceeded:', cloudErr?.message);
          cloudSaved = false;
        }
      }

      if (cloudSaved) {
        showToast('✅ PC Hard Disk සහ Cloud Firestore දෙකෙහිම සාර්ථකව සුරැකිණි!');
      } else {
        await addToSyncQueue(
          effectiveUid,
          isEditMode ? 'update' : 'add',
          'items',
          cleanPayload,
          targetId
        );
        showToast('💾 PC Hard Disk එකේ සාර්ථකව සුරැකිණි! (Cloud Quota සීමා වී ඇති බැවින් දත්ත Hard Disk එකට සුරැකී Sync Queue එකට එක්විය)');
      }

      if (onSuccess) onSuccess(targetId);
      setTimeout(() => {
        if (onCancel) onCancel();
        else router.push('/items');
      }, 700);
    } catch (e) {
      console.error('[ItemForm] Save error:', e);
      showToast('❌ සුරැකීමේ දෝෂයක්: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!resolvedItemId) return;
    if (!confirm(`"${formData.name}" භාණ්ඩය මකා දැමීමට අවශ්‍ය බව සහතිකද?`)) return;
    const effectiveUid = user?.uid || 'local_user';
    setSaving(true);
    try {
      if (isOnline() && db && !String(resolvedItemId).startsWith('local_')) {
        await deleteDoc(doc(db, 'items', resolvedItemId)).catch(() => {});
        showToast('🗑️ භාණ්ඩය සාර්ථකව මකා දමන ලදී');
      } else {
        await addToSyncQueue(effectiveUid, 'delete', 'items', {}, resolvedItemId);
        showToast('💾 Offline delete — sync pending');
      }

      try {
        const isReady = await safeTimeout(ensureDbOpen(), 800, false);
        if (isReady && localDb && typeof localDb.isOpen === 'function' && localDb.isOpen() && localDb.items) {
          await localDb.items.delete(resolvedItemId);
        }
        await deleteItemLocal(resolvedItemId);
      } catch (_) {}

      setTimeout(() => {
        if (onCancel) onCancel();
        else router.push('/items');
      }, 700);
    } catch (e) {
      showToast('❌ Delete error: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-600 font-bold">Hard Disk එකෙන් භාණ්ඩ විස්තර ලබා ගනිමින් පවතී...</p>
        </div>
      </div>
    );
  }

  const availableUomOptions = Array.from(new Set([
    formData.uomName,
    ...(formData.availableUnits || []).map(u => (typeof u === 'string' ? u : u?.toUnitName)),
  ].filter(Boolean)));

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {!online && (
        <div className="sticky top-0 z-50 bg-gradient-to-r from-orange-500 to-red-500 text-white text-center py-2 font-bold text-sm shadow-md">
          ⚠️ Offline Mode — දත්ත PC Hard Disk එකට සුරැකේ. Internet ලැබුණු විට Cloud සමඟ auto-sync වේ.
          {pendingCount > 0 && <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full">{pendingCount} pending</span>}
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4 shadow-lg sticky top-0 z-40">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { if (onCancel) onCancel(); else router.back(); }}
              className="bg-white/20 hover:bg-white/30 rounded-full w-10 h-10 flex items-center justify-center font-bold text-xl transition-all"
            >
              ←
            </button>
            <div>
              <h1 className="font-bold text-lg flex items-center gap-2">
                {isEditMode ? '✏️ භාණ්ඩ සංස්කරණය (Edit Item)' : '➕ නව භාණ්ඩයක් එක් කරන්න (New Item)'}
              </h1>
              <div className="text-xs opacity-80 flex items-center gap-2">
                <span>{online ? '🌐 Online (Dual-Save Mode)' : '💾 Offline (PC Hard Disk Only)'}</span>
                {syncing && <span>🔄 Syncing...</span>}
              </div>
            </div>
          </div>
          {isEditMode && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="bg-red-500/80 hover:bg-red-600 px-3 py-2 rounded-xl font-bold text-sm disabled:opacity-50 transition-colors shadow"
            >
              🗑️ Delete
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b sticky top-[68px] z-30 shadow-sm">
        <div className="max-w-4xl mx-auto flex overflow-x-auto">
          {[
            { key: 'basic',    label: '📝 මූලික විස්තර', },
            { key: 'pricing',  label: '💰 මිල ගණන්',     },
            { key: 'stock',    label: '📦 Stock ප්‍රමාණය', },
            { key: 'warranty', label: '🛡️ වගකීම',      },
            { key: 'images',   label: '📷 පින්තූර',       },
            { key: 'advanced', label: '⚙️ උසස් සැකසුම්',  },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 px-4 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap
                ${activeTab === tab.key ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Form Content */}
      <div className="p-4 max-w-4xl mx-auto space-y-4">
        {activeTab === 'basic' && (
          <>
            <div className="bg-white p-4 rounded-xl shadow-sm border space-y-3">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1">📦 භාණ්ඩයේ නම (Item Name) *</label>
                <input
                  className="w-full border-2 border-gray-200 p-3 rounded-xl font-bold text-gray-800 outline-none focus:border-blue-500 transition-colors"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="උදා: Sunsilk Shampoo 180ml"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1">🇱🇰 සිංහල නම (නොමිලේ පෙන්වීමට)</label>
                <input
                  className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-blue-500"
                  value={formData.sinhalaName}
                  onChange={(e) => updateField('sinhalaName', e.target.value)}
                  placeholder="සිංහල නම"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-1">🔖 Item Code</label>
                  <input
                    className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-blue-500"
                    value={formData.itemCode}
                    onChange={(e) => updateField('itemCode', e.target.value)}
                    placeholder="ITM-001"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-bold text-gray-800">📊 Barcode</label>
                    <button
                      type="button"
                      onClick={handleGenerateBarcode}
                      className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold hover:bg-blue-100"
                    >
                      ⚡ Barcode උත්පාදනය
                    </button>
                  </div>
                  <input
                    className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-blue-500 font-mono"
                    value={formData.barcode}
                    onChange={(e) => updateField('barcode', e.target.value)}
                    placeholder="890123456789"
                  />
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
              <SmartSelectWithManage
                label="වෙළඳ නාමය (Brand)" icon="🏷️"
                value={formData.brandId} displayValue={formData.brandName}
                options={brands}
                onSelect={(id, name) => updateFields({ brandId: id, brandName: name })}
                collectionName="brands" uid={user?.uid} showToast={showToast}
              />
              <SmartSelectWithManage
                label="වර්ගය (Category)" icon="📂"
                value={formData.categoryId} displayValue={formData.categoryName}
                options={categories}
                onSelect={(id, name) => updateFields({ categoryId: id, categoryName: name, subCategoryId: '', subCategoryName: '' })}
                collectionName="categories" uid={user?.uid} showToast={showToast}
              />
              <SmartSelectWithManage
                label="උප වර්ගය (Sub Category)" icon="📁"
                value={formData.subCategoryId} displayValue={formData.subCategoryName}
                options={subCategories}
                onSelect={(id, name) => updateFields({ subCategoryId: id, subCategoryName: name })}
                collectionName="subCategories" uid={user?.uid} showToast={showToast}
                parentFilter={{ field: 'categoryId', value: formData.categoryId }}
                parentRequired={true} parentLabel="වර්ගය (Category)"
              />
              <UomSmartSelect
                value={formData.uomId} displayValue={formData.uomName}
                uoms={uoms}
                onSelect={(id, name, conversions) => {
                  const defaultDisplay = name || '';
                  updateFields({
                    uomId: id,
                    uomName: name,
                    availableUnits: conversions || [],
                    displayUom: formData.displayUom || defaultDisplay,
                  });
                }}
                uid={user?.uid} showToast={showToast}
              />
              <div className="bg-teal-50/70 p-3.5 rounded-xl border-2 border-teal-200">
                <label className="block text-sm font-bold text-teal-900 mb-1">
                  👁️ භාණ්ඩ පෙනීමේදී සහ POS එකේදී පෙන්විය යුතු UOM එක (Display / Default UOM) *
                </label>
                <div className="flex gap-2">
                  <select
                    className="flex-1 border-2 border-teal-300 p-3 rounded-xl font-bold text-teal-900 bg-white outline-none focus:border-teal-600"
                    value={formData.displayUom || formData.uomName || ''}
                    onChange={(e) => updateField('displayUom', e.target.value)}
                  >
                    <option value="">-- ප්‍රදර්ශනය වන UOM එක තෝරන්න --</option>
                    {availableUomOptions.map((unit, idx) => (
                      <option key={idx} value={unit}>
                        {unit} {unit === formData.uomName ? '(මූලික Unit)' : '(පරිවර්තන Unit)'}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-teal-700 mt-1 font-medium">
                  💡 බිල්පත් සහ තොග ලැයිස්තුවේදී (POS & Items) මෙම භාණ්ඩය අසල දිස්විය යුතු මිනුම් ඒකකය මෙතැනින් තෝරන්න.
                </p>
              </div>
              <SmartSelectWithManage
                label="වර්ණය (Color)" icon="🎨"
                value={formData.colorId} displayValue={formData.colorName}
                options={colors}
                onSelect={(id, name) => updateFields({ colorId: id, colorName: name })}
                collectionName="colors" uid={user?.uid} showToast={showToast}
                colorPicker={true}
              />
            </div>
          </>
        )}

        {activeTab === 'pricing' && (
          <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-1">💵 මිලදී ගත් මිල (Buying Cost Price)</label>
              <input
                type="number" step="any"
                className="w-full border-2 border-gray-200 p-3 rounded-xl font-bold outline-none focus:border-blue-500 text-lg"
                value={formData.buyingPrice}
                onChange={(e) => updateField('buyingPrice', e.target.value)}
                placeholder="0.00"
              />
            </div>
            {['Retail', 'Wholesale', 'Loose'].map(type => {
              const key = type.toLowerCase();
              const priceField = `sellingPrice${type}`;
              const discField  = `${key}Discount`;
              const netField   = `${key}YourPrice`;
              return (
                <div key={type} className="bg-gray-50 p-3.5 rounded-xl border">
                  <div className="font-bold text-sm text-gray-800 mb-2">💰 {type} Price සැකසුම</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1">විකුණුම් මිල</label>
                      <input
                        type="number" step="any"
                        className="w-full border p-2.5 rounded-lg text-sm outline-none bg-white font-bold"
                        value={formData[priceField]}
                        onChange={(e) => {
                          const price = e.target.value;
                          updateFields({
                            [priceField]: price,
                            [netField]: calcNet(price, formData[discField]),
                          });
                        }}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-600 block mb-1">වට්ටම %</label>
                      <input
                        type="number" step="any"
                        className="w-full border p-2.5 rounded-lg text-sm outline-none bg-white"
                        value={formData[discField]}
                        onChange={(e) => {
                          const disc = e.target.value;
                          updateFields({
                            [discField]: disc,
                            [netField]: calcNet(formData[priceField], disc),
                          });
                        }}
                        placeholder="0%"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-green-700 block mb-1">ශුද්ධ මිල (Net)</label>
                      <input
                        readOnly
                        className="w-full border p-2.5 rounded-lg text-sm bg-green-50 font-bold text-green-800"
                        value={formData[netField] || calcNet(formData[priceField], formData[discField])}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'stock' && (
          <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
            <div className="bg-blue-50 p-4 rounded-xl border-2 border-blue-200">
              <label className="block text-sm font-bold text-blue-950 mb-1">
                📦 පවතින සම්පූර්ණ තොග ප්‍රමාණය (Current Available Stock) *
              </label>
              <input
                type="number" step="any" min="0"
                className="w-full border-2 border-blue-300 p-3 rounded-xl font-bold text-xl text-blue-900 outline-none focus:border-blue-600 bg-white"
                value={formData.currentStock}
                onChange={(e) => updateField('currentStock', e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-blue-700 mt-1 font-medium">
                දැනට සාප්පුවේ පවතින සැබෑ ප්‍රමාණය (Units/Pcs) ඇතුළත් කරන්න.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1">📉 අවම මට්ටම (Min Stock)</label>
                <input
                  type="number"
                  className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-blue-400"
                  value={formData.minStockLevel}
                  onChange={(e) => updateField('minStockLevel', e.target.value)}
                  placeholder="5"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-1">📈 උපරිම මට්ටම (Max Stock)</label>
                <input
                  type="number"
                  className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-blue-400"
                  value={formData.maxStockLevel}
                  onChange={(e) => updateField('maxStockLevel', e.target.value)}
                  placeholder="100"
                />
              </div>
            </div>
            <SmartSelectWithManage
              label="රාක්කය / ස්ථානය (Rack/Location)" icon="🗄️"
              value={formData.rackId} displayValue={formData.rackName}
              options={racks}
              onSelect={(id, name) => updateFields({ rackId: id, rackName: name })}
              collectionName="racks" uid={user?.uid} showToast={showToast}
            />
            <SmartSelectWithManage
              label="සැපයුම්කරු (Supplier)" icon="🚚"
              value={formData.supplierId} displayValue={formData.supplierName}
              options={suppliers}
              onSelect={(id, name) => updateFields({ supplierId: id, supplierName: name })}
              collectionName="suppliers" uid={user?.uid} showToast={showToast}
            />
            <ToggleRow
              label="Stock නැති විටත් විකිණීමට ඉඩ දෙන්න"
              desc="Stock = 0 වුවත් POS එකෙන් බිල් කිරීමට අවසර දේ"
              checked={formData.allowOrderWhenOutOfStock}
              onChange={(v) => updateField('allowOrderWhenOutOfStock', v)}
            />
          </div>
        )}

        {activeTab === 'warranty' && (
          <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">🛡️ වගකීම් වර්ගය</label>
              <div className="grid grid-cols-2 gap-2">
                {WARRANTY_TYPES.map(wt => (
                  <button
                    key={wt.value}
                    type="button"
                    onClick={() => updateField('warrantyType', wt.value)}
                    className={`p-3 rounded-xl border-2 text-sm font-bold transition-all text-left
                      ${formData.warrantyType === wt.value ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700'}`}
                  >
                    {wt.icon} {wt.label}
                  </button>
                ))}
              </div>
            </div>
            {formData.warrantyType && (
              <>
                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-2">⏱️ වගකීම් කාලය</label>
                  <div className="flex flex-wrap gap-2">
                    {WARRANTY_PERIODS.map(wp => (
                      <button
                        key={wp.value}
                        type="button"
                        onClick={() => updateField('warrantyPeriod', wp.value)}
                        className={`px-3 py-2 rounded-xl border-2 text-xs font-bold
                          ${formData.warrantyPeriod === wp.value ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600'}`}
                      >
                        {wp.label} <span className="opacity-60">({wp.desc})</span>
                      </button>
                    ))}
                  </div>
                </div>
                {formData.warrantyPeriod && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm font-medium text-green-900">
                    <b>📅 කල් ඉකුත් වීම:</b> {calcWarrantyExpiry(formData.warrantyPeriod)}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-bold text-gray-800 mb-1">📝 වගකීම් නියමයන් (Warranty Terms)</label>
                  <textarea
                    rows={3}
                    className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-blue-400"
                    value={formData.warrantyTerms}
                    onChange={(e) => updateField('warrantyTerms', e.target.value)}
                    placeholder="අමතර කොන්දේසි..."
                  />
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'images' && (
          <ImageUploadSection
            formData={formData}
            uid={user?.uid}
            itemId={resolvedItemId}
            onImagesChange={(imgs) => updateFields(imgs)}
            isOnlineStatus={online}
          />
        )}

        {activeTab === 'advanced' && (
          <div className="bg-white p-4 rounded-xl shadow-sm border divide-y">
            <ToggleRow label="භාණ්ඩය හංගන්න (Hidden)" desc="මෙම භාණ්ඩය POS ලැයිස්තුවේ නොපෙන්වයි" checked={formData.isHidden} onChange={(v) => updateField('isHidden', v)} />
            <ToggleRow label="මිලදී ගැනීම පමණයි (Purchase Only)" desc="විකිණීමට නොවේ" checked={formData.isPurchaseOnly} onChange={(v) => updateField('isPurchaseOnly', v)} />
            <ToggleRow label="මිල පෙන්වන්න" checked={formData.showPrice} onChange={(v) => updateField('showPrice', v)} />
            <ToggleRow label="වට්ටම පෙන්වන්න" checked={formData.showDiscount} onChange={(v) => updateField('showDiscount', v)} />
            <ToggleRow label="VAT බදු සක්‍රීය කරන්න" checked={formData.vatEnabled} onChange={(v) => updateField('vatEnabled', v)} />
            <ToggleRow label="KOT (Kitchen Order Ticket)" checked={formData.kot} onChange={(v) => updateField('kot', v)} />
            <div className="py-3">
              <label className="block text-sm font-bold text-gray-800 mb-1">📝 අමතර විස්තරය (Description)</label>
              <textarea
                rows={3}
                className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:border-blue-400"
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="භාණ්ඩය පිළිබඳ අමතර සටහනක්..."
              />
            </div>
          </div>
        )}
      </div>

      {/* Dual Save Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-2xl p-3 z-40">
        <div className="max-w-4xl mx-auto flex gap-3">
          <button
            type="button"
            onClick={() => { if (onCancel) onCancel(); else router.back(); }}
            className="flex-1 bg-gray-200 hover:bg-gray-300 py-3.5 rounded-xl font-bold text-sm transition-colors"
          >
            ❌ අවලංගු කරන්න
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !formData.name?.trim()}
            className={`flex-[2] py-3.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all
              ${online ? 'bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700' : 'bg-gradient-to-r from-orange-500 to-red-500'}
              disabled:opacity-50 flex items-center justify-center gap-2`}
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>සුරකිමින් පවතී (Hard Disk + Cloud)...</span>
              </>
            ) : isEditMode ? (
              <span>💾 සංස්කරණය සුරකින්න (Update Item)</span>
            ) : (
              <span>💾 භාණ්ඩය සුරකින්න (Save Item)</span>
            )}
          </button>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function ItemFormPage(props) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 text-slate-300 flex items-center justify-center p-6">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mr-3"></div>
        <span className="font-medium text-slate-200">භාණ්ඩ Form එක සූදානම් වෙමින් පවතී...</span>
      </div>
    }>
      <ItemFormContent {...props} />
    </Suspense>
  );
}