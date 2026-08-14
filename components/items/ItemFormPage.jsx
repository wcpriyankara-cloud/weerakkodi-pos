'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUserAuth } from '@/context/UserContext';
import { db, storage } from '@/lib/firebase';
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, where, getDoc,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

/* ══════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════ */
const DEFAULT_IMG =
  'https://placehold.co/200x200/e2e8f0/64748b?text=No+Image';

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

const COMMON_UOMS = [
  { name: 'Piece',     symbol: 'pcs',  group: 'ගණන්' },
  { name: 'Kilogram',  symbol: 'kg',   group: 'බර' },
  { name: 'Gram',      symbol: 'g',    group: 'බර' },
  { name: 'Liter',     symbol: 'L',    group: 'පරිමාව' },
  { name: 'Milliliter',symbol: 'ml',   group: 'පරිමාව' },
  { name: 'Meter',     symbol: 'm',    group: 'දිග' },
  { name: 'Centimeter',symbol: 'cm',   group: 'දිග' },
  { name: 'Foot',      symbol: 'ft',   group: 'දිග' },
  { name: 'Inch',      symbol: 'in',   group: 'දිග' },
  { name: 'Box',       symbol: 'box',  group: 'ඇසුරුම්' },
  { name: 'Pack',      symbol: 'pack', group: 'ඇසුරුම්' },
  { name: 'Dozen',     symbol: 'dz',   group: 'ඇසුරුම්' },
  { name: 'Pair',      symbol: 'pr',   group: 'ගණන්' },
  { name: 'Set',       symbol: 'set',  group: 'ගණන්' },
  { name: 'Roll',      symbol: 'roll', group: 'ඇසුරුම්' },
  { name: 'Sheet',     symbol: 'sht',  group: 'ගණන්' },
  { name: 'Bottle',    symbol: 'btl',  group: 'ඇසුරුම්' },
  { name: 'Bag',       symbol: 'bag',  group: 'ඇසුරුම්' },
  { name: 'Yard',      symbol: 'yd',   group: 'දිග' },
  { name: 'Pound',     symbol: 'lb',   group: 'බර' },
  { name: 'Ounce',     symbol: 'oz',   group: 'බර' },
  { name: 'Gallon',    symbol: 'gal',  group: 'පරිමාව' },
  { name: 'Square Meter', symbol: 'm²', group: 'ප්‍රමාණය' },
  { name: 'Square Foot',  symbol: 'ft²', group: 'ප්‍රමාණය' },
];

const INITIAL_FORM = {
  id: null,
  itemCode: '', barcode: '', barcodeImage: '',
  name: '', sinhalaName: '', modelKeyCode: '',
  brandId: '', brandName: '',
  categoryId: '', categoryName: '',
  subCategoryId: '', subCategoryName: '',
  uomId: '', uomName: '', availableUnits: [],
  isHidden: false, isPurchaseOnly: false,
  showPrice: true, showDiscount: true,
  allowOrderWhenOutOfStock: false,
  catalogPriceType: 'retail', catalogUom: '',
  colorId: '', colorName: '',
  rackId: '', rackName: '',
  supplierId: '', supplierName: '',
  minStockLevel: '', maxStockLevel: '',
  buyingPrice: '',
  sellingPriceRetail: '', retailDiscount: '', retailYourPrice: '',
  sellingPriceWholesale: '', wholesaleDiscount: '', wholesaleYourPrice: '',
  sellingPriceLoose: '', looseDiscount: '', looseYourPrice: '',
  vatEnabled: false, kot: false, description: '',
  images: [], imagePaths: [], picture: '',
  warrantyType: '', warrantyPeriod: '',
  warrantyTerms: '', warrantyNotes: '',
};

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
const calcNet = (price, discount) => {
  const p = parseFloat(price || 0);
  const d = parseFloat(discount || 0);
  return (p - (p * d) / 100).toFixed(2);
};

const calcWarrantyExpiry = (period) => {
  if (!period) return '';
  const txt = String(period).toLowerCase().trim();
  if (txt === 'lifetime') return '♾️ ජීවිත කාල';
  const match = txt.match(
    /^(\d+)\s*(day|days|month|months|year|years|d|m|y)s?$/i
  );
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

const compressImage = (source, maxWidth = 800, quality = 0.82) =>
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
        'image/jpeg', quality
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

/* ══════════════════════════════════════════
   TOAST
══════════════════════════════════════════ */
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      background: type === 'error' ? '#dc2626' : '#16a34a',
      color: 'white', padding: '14px 20px',
      borderRadius: 12, fontWeight: 700,
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      animation: 'fadeIn 0.3s ease',
      maxWidth: 320,
    }}>
      {message}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ══════════════════════════════════════════
   TOGGLE ROW
══════════════════════════════════════════ */
function ToggleRow({ label, desc, checked, onChange, color = 'peer-checked:bg-blue-600' }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 pr-3">
        <div className="font-medium text-gray-800 text-sm">{label}</div>
        {desc && (
          <div className="text-[11px] text-gray-400 mt-0.5">{desc}</div>
        )}
      </div>
      <label className="relative inline-flex items-center cursor-pointer shrink-0">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
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

/* ══════════════════════════════════════════
   IMAGE UPLOAD SECTION
══════════════════════════════════════════ */
function ImageUploadSection({ formData, uid, itemId, onImagesChange }) {
  const [uploading, setUploading]           = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const fileInputRef = useRef(null);

  const uploadToStorage = async (file) => {
    const blob     = await compressImage(file, 800, 0.82);
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const path     = `items/${uid}/${itemId || 'new'}/${filename}`;
    const fileRef  = storageRef(storage, path);
    const snap     = await uploadBytes(fileRef, blob, {
      contentType: 'image/jpeg',
    });
    const url = await getDownloadURL(snap.ref);
    return { url, path };
  };

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    const newImages = [];
    const newPaths  = [];
    for (let i = 0; i < files.length; i++) {
      setUploadProgress(`Uploading ${i + 1}/${files.length}...`);
      try {
        const { url, path } = await uploadToStorage(files[i]);
        newImages.push(url);
        newPaths.push(path);
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
    onImagesChange({
      images:     [...(formData.images || []), ...newImages],
      imagePaths: [...(formData.imagePaths || []), ...newPaths],
    });
    setUploading(false);
    setUploadProgress('');
  };

  const removeImage = async (idx) => {
    const imgs  = [...(formData.images || [])];
    const paths = [...(formData.imagePaths || [])];
    if (paths[idx]) {
      try { await deleteObject(storageRef(storage, paths[idx])); } catch {}
    }
    imgs.splice(idx, 1);
    paths.splice(idx, 1);
    onImagesChange({ images: imgs, imagePaths: paths });
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border">
      <label className="block font-bold mb-3 text-center">📷 භාණ්ඩ රූප</label>

      {(formData.images || []).length > 0 ? (
        <div className="flex overflow-x-auto gap-3 pb-3 mb-3">
          {(formData.images || []).map((img, idx) => (
            <div key={idx} className="relative shrink-0" style={{ minWidth: 100 }}>
              <div className="w-24 h-24 border-2 border-gray-200 rounded-xl overflow-hidden bg-gray-50">
                <img src={img} className="w-full h-full object-cover"
                  onError={(e) => { e.target.src = DEFAULT_IMG; }} alt="" />
              </div>
              {idx === 0 && (
                <span className="absolute bottom-1 left-1 bg-blue-600
                  text-white text-[9px] px-1.5 py-0.5 rounded font-bold">Main</span>
              )}
              <button onClick={() => removeImage(idx)}
                className="absolute -top-2 -right-2 bg-red-600 text-white
                  rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-md">✕</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-200 rounded-xl
          h-28 flex flex-col items-center justify-center mb-3 bg-gray-50 text-gray-400">
          <div className="text-3xl mb-1">📷</div>
          <div className="text-sm">රූප නොමැත</div>
        </div>
      )}

      {uploading && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
          <div className="w-5 h-5 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <span className="text-blue-700 text-sm font-bold">{uploadProgress}</span>
        </div>
      )}

      <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
        className="w-full bg-gray-100 text-gray-800 py-3 rounded-xl font-bold hover:bg-gray-200 disabled:opacity-50">
        📂 Gallery
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => handleFiles(Array.from(e.target.files || []))} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SMART SELECT WITH FULL CRUD MANAGEMENT MODAL
══════════════════════════════════════════════════════════════ */
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

  const PRESET_COLORS = [
    '#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e',
    '#14b8a6','#06b6d4','#3b82f6','#6366f1','#8b5cf6','#a855f7',
    '#d946ef','#ec4899','#f43f5e','#78716c','#000000','#ffffff',
  ];

  const filteredByParent = parentFilter
    ? options.filter(o => o[parentFilter.field] === parentFilter.value)
    : options;

  const filtered = filteredByParent.filter((opt) =>
    (opt.name || '').toLowerCase().includes(search.toLowerCase())
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
    if (!nameToAdd?.trim() || !uid) return null;
    setIsSaving(true);
    try {
      const newDoc = { name: nameToAdd.trim(), uid, createdAt: new Date().toISOString() };
      if (colorPicker) newDoc.color = editColor;
      if (parentFilter) newDoc[parentFilter.field] = parentFilter.value;
      extraFields.forEach(ef => { if (editExtras[ef.key]) newDoc[ef.key] = editExtras[ef.key]; });
      const docRef = await addDoc(collection(db, collectionName), newDoc);
      showToast?.(`✅ "${nameToAdd.trim()}" එක් කරන ලදී`);
      return docRef.id;
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
    setIsSaving(true);
    try {
      const updateData = { name: editName.trim(), updatedAt: new Date().toISOString() };
      if (colorPicker) updateData.color = editColor;
      extraFields.forEach(ef => { if (editExtras[ef.key] !== undefined) updateData[ef.key] = editExtras[ef.key]; });
      await updateDoc(doc(db, collectionName, editItem.id), updateData);
      if (value === editItem.id) onSelect(editItem.id, editName.trim());
      showToast?.(`✅ "${editName.trim()}" යාවත්කාලීන කරන ලදී`);
      setEditItem(null); setEditName(''); setEditExtras({});
    } catch (e) {
      showToast?.('❌ Error: ' + e.message, 'error');
    } finally { setIsSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!confirm(`"${item.name}" මකා දැමීමට අවශ්‍යද?`)) return;
    setIsDeleting(item.id);
    try {
      await deleteDoc(doc(db, collectionName, item.id));
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
        <button type="button" onClick={(e) => {
          e.stopPropagation();
          if (parentMissing) { showToast?.(`කරුණාකර පළමුව ${parentLabel} තෝරන්න`, 'error'); return; }
          setIsManageOpen(true);
        }} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg font-bold hover:bg-indigo-200">
          ⚙️ කළමනාකරණය
        </button>
      </div>

      <div onClick={() => {
        if (parentMissing) { showToast?.(`කරුණාකර පළමුව ${parentLabel} තෝරන්න`, 'error'); return; }
        setIsOpen(!isOpen);
      }} className={`border-2 p-3 rounded-xl bg-white cursor-pointer flex justify-between items-center shadow-sm
        hover:border-blue-400 ${parentMissing ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {colorPicker && value && (() => {
            const sel = options.find(o => o.id === value);
            return sel?.color ? <div className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0" style={{ backgroundColor: sel.color }} /> : null;
          })()}
          <span className={`truncate ${value ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
            {value ? (options.find(o => o.id === value)?.name || displayValue || 'Selected')
              : parentMissing ? `පළමුව ${parentLabel} තෝරන්න` : 'තෝරන්න හෝ ටයිප් කර එක් කරන්න...'}
          </span>
        </div>
        <span className={`text-gray-500 transition-transform shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </div>

      {isOpen && !parentMissing && (
        <div className="absolute z-30 w-full bg-white border-2 border-gray-200 mt-1 shadow-2xl max-h-72 overflow-hidden rounded-xl">
          <div className="sticky top-0 bg-white border-b">
            <input autoFocus className="w-full p-3 outline-none text-gray-900 bg-gray-50"
              placeholder="🔍 සොයන්න හෝ නව නමක් ටයිප් කරන්න..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === 'Enter' && search && filtered.length === 0) handleQuickAdd(e); }} />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {value && (
              <div onMouseDown={(e) => { e.preventDefault(); onSelect('', ''); setIsOpen(false); }}
                className="p-3 hover:bg-red-50 cursor-pointer border-b text-red-600 font-medium flex items-center gap-2">
                ✕ ඉවත් කරන්න
              </div>
            )}
            {filtered.map((opt) => (
              <div key={opt.id} onMouseDown={(e) => { e.preventDefault(); onSelect(opt.id, opt.name); setIsOpen(false); setSearch(''); }}
                className={`p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 flex items-center gap-2
                  ${value === opt.id ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-800'}`}>
                {colorPicker && opt.color && <div className="w-4 h-4 rounded-full border shrink-0" style={{ backgroundColor: opt.color }} />}
                <span className="flex-1">{opt.name}</span>
                {value === opt.id && <span>✓</span>}
              </div>
            ))}
            {search && filtered.length === 0 && (
              <div onMouseDown={handleQuickAdd}
                className="p-3 bg-green-50 text-green-700 font-bold cursor-pointer hover:bg-green-100 flex justify-between items-center">
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

      {/* Management Modal */}
      {isManageOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => { setIsManageOpen(false); setEditItem(null); }}>
          <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-slideUp"
            onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-lg">{icon} {label} කළමනාකරණය</h2>
                <button onClick={() => { setIsManageOpen(false); setEditItem(null); }}
                  className="bg-white/20 hover:bg-white/30 rounded-full w-8 h-8 flex items-center justify-center font-bold">✕</button>
              </div>
            </div>

            <div className="p-4 border-b bg-gray-50">
              <div className="flex gap-2">
                <input className="flex-1 border-2 border-gray-200 p-3 rounded-xl text-sm font-medium outline-none focus:border-indigo-400"
                  placeholder={`නව ${label} නමක්...`}
                  value={editItem ? '' : search} onChange={(e) => { if (!editItem) setSearch(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !editItem && search.trim()) handleAdd(search.trim()).then(id => { if (id) setSearch(''); }); }}
                  disabled={!!editItem} />
                <button type="button" onClick={() => { if (!editItem && search.trim()) handleAdd(search.trim()).then(id => { if (id) setSearch(''); }); }}
                  disabled={isSaving || !!editItem || !search.trim()}
                  className="bg-indigo-600 text-white px-4 rounded-xl font-bold disabled:opacity-50 shrink-0">
                  {isSaving ? '⏳' : '➕'}
                </button>
              </div>
              {colorPicker && !editItem && search.trim() && (
                <div className="mt-3">
                  <label className="text-xs font-bold text-gray-600 block mb-1">🎨 වර්ණය</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {PRESET_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setEditColor(c)}
                        className={`w-7 h-7 rounded-full border-2 ${editColor === c ? 'border-gray-800 scale-125 shadow-md' : 'border-gray-200 hover:scale-110'}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {editItem && (
              <div className="p-4 border-b bg-amber-50">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-amber-600 font-bold text-sm">✏️ සංස්කරණය:</span>
                  <span className="text-gray-600 text-xs bg-amber-100 px-2 py-0.5 rounded-full">{editItem.name}</span>
                </div>
                <input className="w-full border-2 border-amber-200 p-3 rounded-xl text-sm font-bold outline-none focus:border-amber-400 bg-white"
                  value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(); }} autoFocus />
                {colorPicker && (
                  <div className="mt-3">
                    <div className="flex gap-1.5 flex-wrap">
                      {PRESET_COLORS.map(c => (
                        <button key={c} type="button" onClick={() => setEditColor(c)}
                          className={`w-7 h-7 rounded-full border-2 ${editColor === c ? 'border-gray-800 scale-125' : 'border-gray-200'}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                )}
                {extraFields.map(ef => (
                  <div key={ef.key} className="mt-3">
                    <label className="text-xs font-bold text-gray-600 block mb-1">{ef.icon} {ef.label}</label>
                    <input className="w-full border-2 border-amber-200 p-2 rounded-lg text-sm outline-none bg-white"
                      value={editExtras[ef.key] || ''} onChange={(e) => setEditExtras(prev => ({ ...prev, [ef.key]: e.target.value }))} />
                  </div>
                ))}
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => { setEditItem(null); setEditName(''); }}
                    className="flex-1 bg-gray-200 py-2 rounded-xl font-bold text-sm">❌ අවලංගු</button>
                  <button type="button" onClick={handleUpdate} disabled={isSaving || !editName.trim()}
                    className="flex-1 bg-amber-500 text-white py-2 rounded-xl font-bold text-sm disabled:opacity-50">
                    {isSaving ? '⏳' : '✅ යාවත්කාලීන'}
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {filteredByParent.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <div className="text-4xl mb-2">{icon}</div>
                  <p className="font-medium">දත්ත නොමැත</p>
                </div>
              ) : filteredByParent.map((item, idx) => (
                <div key={item.id} className={`flex items-center gap-3 px-4 py-3 border-b hover:bg-gray-50
                  ${value === item.id ? 'bg-blue-50' : ''} ${isDeleting === item.id ? 'opacity-50' : ''}`}>
                  {colorPicker && item.color
                    ? <div className="w-8 h-8 rounded-full border-2 border-gray-200 shrink-0" style={{ backgroundColor: item.color }} />
                    : <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">{idx + 1}</div>
                  }
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { onSelect(item.id, item.name); setIsManageOpen(false); }}>
                    <div className="font-medium text-gray-800 truncate">{item.name}</div>
                  </div>
                  {value === item.id && <span className="bg-blue-600 text-white text-[9px] px-2 py-0.5 rounded-full font-bold shrink-0">✓</span>}
                  <button type="button" onClick={(e) => { e.stopPropagation(); startEdit(item); }}
                    className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center hover:bg-amber-200 shrink-0">✏️</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(item); }} disabled={isDeleting === item.id}
                    className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center hover:bg-red-200 shrink-0 disabled:opacity-50">🗑️</button>
                </div>
              ))}
            </div>
            <div className="p-3 bg-gray-50 border-t text-center">
              <span className="text-xs text-gray-500 font-medium">📊 මුළු: {filteredByParent.length}</span>
            </div>
          </div>
          <style>{`
            @keyframes slideUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
            .animate-slideUp { animation: slideUp 0.3s ease; }
          `}</style>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   UOM SMART SELECT WITH CREATE + MANAGE
   - Select existing UOM
   - ➕ Create new UOM with conversions
   - ✏️ Edit UOM name/conversions
   - 🗑️ Delete UOM
══════════════════════════════════════════════════════════════ */
function UomSmartSelect({ value, displayValue, uoms, onSelect, uid, showToast }) {
  const [isOpen, setIsOpen]             = useState(false);
  const [search, setSearch]             = useState('');
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen]     = useState(false);
  const [editUom, setEditUom]           = useState(null);
  const [isDeleting, setIsDeleting]     = useState(null);

  // Create / Edit form state
  const [newUomName, setNewUomName]     = useState('');
  const [newUomSymbol, setNewUomSymbol] = useState('');
  const [conversions, setConversions]   = useState([]);
  const [isSaving, setIsSaving]         = useState(false);

  const ref = useRef(null);

  const selectedUom = uoms.find(u => u.id === value);

  const filtered = uoms.filter(u =>
    (u.fromUnitName || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.symbol || '').toLowerCase().includes(search.toLowerCase())
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

  /* ── Add conversion row ── */
  const addConversionRow = () => {
    setConversions(prev => [...prev, { toUnitName: '', rate: '', symbol: '' }]);
  };

  const updateConversion = (idx, field, val) => {
    setConversions(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const removeConversion = (idx) => {
    setConversions(prev => prev.filter((_, i) => i !== idx));
  };

  /* ── Open create modal ── */
  const openCreate = () => {
    setNewUomName('');
    setNewUomSymbol('');
    setConversions([]);
    setIsCreateOpen(true);
  };

  /* ── Open edit modal ── */
  const openEdit = (uom) => {
    setEditUom(uom);
    setNewUomName(uom.fromUnitName || '');
    setNewUomSymbol(uom.symbol || '');
    setConversions(uom.conversions?.map(c => ({ ...c })) || []);
    setIsEditOpen(true);
  };

  /* ── Quick add from common ── */
  const quickAddCommon = async (commonUom) => {
    if (!uid) return;
    const exists = uoms.find(u =>
      (u.fromUnitName || '').toLowerCase() === commonUom.name.toLowerCase()
    );
    if (exists) {
      showToast?.(`"${commonUom.name}" දැනටමත් ඇත`, 'error');
      return;
    }
    setIsSaving(true);
    try {
      const docRef = await addDoc(collection(db, 'uoms'), {
        fromUnitName: commonUom.name,
        symbol:       commonUom.symbol,
        conversions:  [],
        uid,
        createdAt:    new Date().toISOString(),
      });
      showToast?.(`✅ "${commonUom.name}" එක් කරන ලදී`);
      onSelect(docRef.id, commonUom.name, []);
    } catch (e) {
      showToast?.('❌ Error: ' + e.message, 'error');
    } finally { setIsSaving(false); }
  };

  /* ── Save new UOM ── */
  const saveNewUom = async () => {
    if (!newUomName.trim() || !uid) {
      showToast?.('කරුණාකර මිනුම් නම ඇතුළත් කරන්න', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const validConversions = conversions
        .filter(c => c.toUnitName.trim() && c.rate)
        .map(c => ({
          toUnitName: c.toUnitName.trim(),
          rate:       Number(c.rate) || 1,
          symbol:     c.symbol || '',
        }));

      const docRef = await addDoc(collection(db, 'uoms'), {
        fromUnitName: newUomName.trim(),
        symbol:       newUomSymbol.trim(),
        conversions:  validConversions,
        uid,
        createdAt:    new Date().toISOString(),
      });
      showToast?.(`✅ "${newUomName.trim()}" UOM එක් කරන ලදී`);
      onSelect(docRef.id, newUomName.trim(), validConversions);
      setIsCreateOpen(false);
      setNewUomName('');
      setNewUomSymbol('');
      setConversions([]);
    } catch (e) {
      showToast?.('❌ Error: ' + e.message, 'error');
    } finally { setIsSaving(false); }
  };

  /* ── Update UOM ── */
  const updateUom = async () => {
    if (!editUom || !newUomName.trim()) return;
    setIsSaving(true);
    try {
      const validConversions = conversions
        .filter(c => c.toUnitName.trim() && c.rate)
        .map(c => ({
          toUnitName: c.toUnitName.trim(),
          rate:       Number(c.rate) || 1,
          symbol:     c.symbol || '',
        }));

      await updateDoc(doc(db, 'uoms', editUom.id), {
        fromUnitName: newUomName.trim(),
        symbol:       newUomSymbol.trim(),
        conversions:  validConversions,
        updatedAt:    new Date().toISOString(),
      });

      if (value === editUom.id) {
        onSelect(editUom.id, newUomName.trim(), validConversions);
      }

      showToast?.(`✅ "${newUomName.trim()}" යාවත්කාලීන කරන ලදී`);
      setIsEditOpen(false);
      setEditUom(null);
    } catch (e) {
      showToast?.('❌ Error: ' + e.message, 'error');
    } finally { setIsSaving(false); }
  };

  /* ── Delete UOM ── */
  const deleteUom = async (uom) => {
    if (!confirm(`"${uom.fromUnitName}" මකා දැමීමට අවශ්‍යද?`)) return;
    setIsDeleting(uom.id);
    try {
      await deleteDoc(doc(db, 'uoms', uom.id));
      if (value === uom.id) onSelect('', '', []);
      showToast?.(`🗑️ "${uom.fromUnitName}" මකා දමන ලදී`);
    } catch (e) {
      showToast?.('❌ Error: ' + e.message, 'error');
    } finally { setIsDeleting(null); }
  };

  /* ── UOM Create/Edit Form (shared) ── */
  const renderUomForm = (isEdit) => (
    <div className="p-4 space-y-4">
      {/* Base unit name */}
      <div>
        <label className="block text-sm font-bold text-gray-800 mb-1">
          📏 මූලික මිනුම් නම *
        </label>
        <input className="w-full border-2 border-gray-200 p-3 rounded-xl text-sm font-bold outline-none focus:border-teal-400"
          value={newUomName} onChange={(e) => setNewUomName(e.target.value)}
          placeholder="උදා: Kilogram, Piece, Meter..." autoFocus />
      </div>

      {/* Symbol */}
      <div>
        <label className="block text-sm font-bold text-gray-800 mb-1">
          🔤 සංකේතය (Symbol)
        </label>
        <input className="w-full border-2 border-gray-200 p-3 rounded-xl text-sm outline-none focus:border-teal-400"
          value={newUomSymbol} onChange={(e) => setNewUomSymbol(e.target.value)}
          placeholder="උදා: kg, pcs, m..." />
      </div>

      {/* Quick select from common UOMs (only for create) */}
      {!isEdit && (
        <div>
          <label className="block text-sm font-bold text-gray-800 mb-2">
            ⚡ ඉක්මන් තේරීම
          </label>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_UOMS.slice(0, 12).map(cu => (
              <button key={cu.name} type="button"
                onClick={() => { setNewUomName(cu.name); setNewUomSymbol(cu.symbol); }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all
                  ${newUomName === cu.name
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-teal-300'
                  }`}>
                {cu.name} ({cu.symbol})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-bold text-gray-800">
            🔄 පරිවර්තන (Conversions)
          </label>
          <button type="button" onClick={addConversionRow}
            className="text-xs bg-teal-100 text-teal-700 px-3 py-1 rounded-lg font-bold hover:bg-teal-200">
            ➕ පරිවර්තනයක් එක් කරන්න
          </button>
        </div>

        {conversions.length === 0 ? (
          <div className="p-4 bg-gray-50 rounded-xl text-center text-gray-400 text-sm border-2 border-dashed">
            <div className="text-2xl mb-1">🔄</div>
            <p>පරිවර්තන නොමැත</p>
            <p className="text-[10px] mt-1">උදා: 1 Kilogram = 1000 Gram</p>
          </div>
        ) : (
          <div className="space-y-3">
            {conversions.map((conv, idx) => (
              <div key={idx} className="bg-teal-50 p-3 rounded-xl border border-teal-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                    #{idx + 1}
                  </span>
                  <span className="text-xs text-teal-600 flex-1">
                    1 {newUomName || '...'} = {conv.rate || '?'} {conv.toUnitName || '...'}
                  </span>
                  <button type="button" onClick={() => removeConversion(idx)}
                    className="w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xs hover:bg-red-200">✕</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">ඒකකය</label>
                    <input className="w-full border p-2 rounded-lg text-sm outline-none focus:border-teal-400"
                      value={conv.toUnitName} onChange={(e) => updateConversion(idx, 'toUnitName', e.target.value)}
                      placeholder="Gram..." />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">අනුපාතය</label>
                    <input type="number" min="0" step="any"
                      className="w-full border p-2 rounded-lg text-sm outline-none focus:border-teal-400 font-bold"
                      value={conv.rate} onChange={(e) => updateConversion(idx, 'rate', e.target.value)}
                      placeholder="1000" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-0.5">සංකේතය</label>
                    <input className="w-full border p-2 rounded-lg text-sm outline-none focus:border-teal-400"
                      value={conv.symbol || ''} onChange={(e) => updateConversion(idx, 'symbol', e.target.value)}
                      placeholder="g" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview */}
      {newUomName && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
          <div className="text-xs font-bold text-green-700 mb-1">📋 පෙරදසුන</div>
          <div className="text-sm font-bold text-green-800">
            {newUomName} {newUomSymbol ? `(${newUomSymbol})` : ''}
          </div>
          {conversions.filter(c => c.toUnitName && c.rate).map((c, i) => (
            <div key={i} className="text-xs text-green-600 mt-0.5">
              🔄 1 {newUomName} = {c.rate} {c.toUnitName}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-bold text-gray-800">📐 මිනුම් සැකසුම (UOM)</label>
        <div className="flex gap-1">
          <button type="button" onClick={openCreate}
            className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded-lg font-bold hover:bg-teal-200">
            ➕ නව UOM
          </button>
          <button type="button" onClick={() => setIsManageOpen(true)}
            className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg font-bold hover:bg-indigo-200">
            ⚙️ කළමනාකරණය
          </button>
        </div>
      </div>

      {/* Selector */}
      <div onClick={() => setIsOpen(!isOpen)}
        className="border-2 p-3 rounded-xl bg-white cursor-pointer flex justify-between items-center shadow-sm hover:border-blue-400">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {selectedUom && (
            <span className="bg-teal-100 text-teal-700 text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0">
              {selectedUom.symbol || selectedUom.fromUnitName?.slice(0, 3)}
            </span>
          )}
          <span className={`truncate ${value ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
            {value ? (selectedUom?.fromUnitName || displayValue || 'Selected') : 'මිනුම් ක්‍රමය තෝරන්න...'}
          </span>
        </div>
        <span className={`text-gray-500 transition-transform shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </div>

      {/* Conversions preview */}
      {selectedUom?.conversions?.length > 0 && (
        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="text-xs font-bold text-blue-700 mb-1">📊 පරිවර්තන:</div>
          <div className="flex flex-wrap gap-1.5">
            {selectedUom.conversions.map((conv, i) => (
              <span key={i} className="bg-white text-blue-800 text-[11px] px-2 py-1 rounded-lg border border-blue-200 font-medium">
                1 {selectedUom.fromUnitName} = {conv.rate} {conv.toUnitName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-30 w-full bg-white border-2 border-gray-200 mt-1 shadow-2xl max-h-72 overflow-hidden rounded-xl">
          <div className="sticky top-0 bg-white border-b">
            <input autoFocus className="w-full p-3 outline-none text-gray-900 bg-gray-50"
              placeholder="🔍 UOM සොයන්න..." value={search}
              onChange={(e) => setSearch(e.target.value)} onClick={(e) => e.stopPropagation()} />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {value && (
              <div onMouseDown={(e) => { e.preventDefault(); onSelect('', '', []); setIsOpen(false); }}
                className="p-3 hover:bg-red-50 cursor-pointer border-b text-red-600 font-medium">
                ✕ ඉවත් කරන්න
              </div>
            )}
            {filtered.map(uom => (
              <div key={uom.id} onMouseDown={(e) => {
                e.preventDefault();
                onSelect(uom.id, uom.fromUnitName, uom.conversions || []);
                setIsOpen(false); setSearch('');
              }} className={`p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0
                ${value === uom.id ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-800'}`}>
                <div className="flex items-center gap-2">
                  <span className="bg-teal-100 text-teal-700 text-[10px] px-1.5 py-0.5 rounded font-bold">
                    {uom.symbol || uom.fromUnitName?.slice(0, 3)}
                  </span>
                  <span className="font-medium flex-1">{uom.fromUnitName}</span>
                  {value === uom.id && <span>✓</span>}
                </div>
                {uom.conversions?.length > 0 && (
                  <div className="text-[10px] text-gray-400 mt-0.5 ml-8">
                    {uom.conversions.map(c => `1:${c.rate} ${c.toUnitName}`).join(' | ')}
                  </div>
                )}
              </div>
            ))}

            {/* Quick create from dropdown */}
            {search && filtered.length === 0 && (
              <div onMouseDown={(e) => { e.preventDefault(); setNewUomName(search); setNewUomSymbol(''); setConversions([]); setIsCreateOpen(true); setIsOpen(false); }}
                className="p-3 bg-green-50 text-green-700 font-bold cursor-pointer hover:bg-green-100 flex items-center gap-2">
                ➕ "{search}" UOM එකක් නිර්මාණය කරන්න
              </div>
            )}

            {filtered.length === 0 && !search && (
              <div className="p-4 text-center text-gray-400 text-sm">
                <p>UOM නොමැත</p>
                <button type="button" onClick={() => { setIsOpen(false); openCreate(); }}
                  className="mt-2 text-teal-600 font-bold text-xs hover:underline">
                  ➕ නව UOM එකක් නිර්මාණය කරන්න
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ CREATE UOM MODAL ═══ */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => setIsCreateOpen(false)}>
          <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-slideUp"
            onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-4 text-white">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-lg">➕ නව UOM නිර්මාණය</h2>
                <button onClick={() => setIsCreateOpen(false)}
                  className="bg-white/20 hover:bg-white/30 rounded-full w-8 h-8 flex items-center justify-center font-bold">✕</button>
              </div>
              <p className="text-white/70 text-xs mt-1">මිනුම් ඒකකය සහ පරිවර්තන සකසන්න</p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {renderUomForm(false)}
            </div>

            <div className="p-4 border-t flex gap-3">
              <button type="button" onClick={() => setIsCreateOpen(false)}
                className="flex-1 bg-gray-200 py-3 rounded-xl font-bold hover:bg-gray-300">
                ❌ අවලංගු
              </button>
              <button type="button" onClick={saveNewUom} disabled={isSaving || !newUomName.trim()}
                className="flex-[2] bg-teal-600 text-white py-3 rounded-xl font-bold hover:bg-teal-700 disabled:opacity-50">
                {isSaving ? '⏳ සුරකිමින්...' : '💾 UOM සුරකින්න'}
              </button>
            </div>
          </div>
          <style>{`
            @keyframes slideUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
            .animate-slideUp { animation: slideUp 0.3s ease; }
          `}</style>
        </div>
      )}

      {/* ═══ EDIT UOM MODAL ═══ */}
      {isEditOpen && editUom && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => { setIsEditOpen(false); setEditUom(null); }}>
          <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-slideUp"
            onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-lg">✏️ UOM සංස්කරණය</h2>
                <button onClick={() => { setIsEditOpen(false); setEditUom(null); }}
                  className="bg-white/20 hover:bg-white/30 rounded-full w-8 h-8 flex items-center justify-center font-bold">✕</button>
              </div>
              <p className="text-white/70 text-xs mt-1">"{editUom.fromUnitName}" සංස්කරණය කරන්න</p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {renderUomForm(true)}
            </div>

            <div className="p-4 border-t flex gap-3">
              <button type="button" onClick={() => { setIsEditOpen(false); setEditUom(null); }}
                className="flex-1 bg-gray-200 py-3 rounded-xl font-bold hover:bg-gray-300">
                ❌ අවලංගු
              </button>
              <button type="button" onClick={updateUom} disabled={isSaving || !newUomName.trim()}
                className="flex-[2] bg-amber-500 text-white py-3 rounded-xl font-bold hover:bg-amber-600 disabled:opacity-50">
                {isSaving ? '⏳ සුරකිමින්...' : '✅ යාවත්කාලීන'}
              </button>
            </div>
          </div>
          <style>{`
            @keyframes slideUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
            .animate-slideUp { animation: slideUp 0.3s ease; }
          `}</style>
        </div>
      )}

      {/* ═══ MANAGE UOM MODAL ═══ */}
      {isManageOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={() => setIsManageOpen(false)}>
          <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-slideUp"
            onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-teal-600 to-cyan-600 p-4 text-white">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-lg">📐 UOM කළමනාකරණය</h2>
                <div className="flex gap-2">
                  <button onClick={openCreate}
                    className="bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1 text-sm font-bold">➕ නව</button>
                  <button onClick={() => setIsManageOpen(false)}
                    className="bg-white/20 hover:bg-white/30 rounded-full w-8 h-8 flex items-center justify-center font-bold">✕</button>
                </div>
              </div>
              <p className="text-white/70 text-xs mt-1">UOM තෝරන්න, සංස්කරණය කරන්න, මකන්න</p>
            </div>

            {/* Quick add common UOMs */}
            <div className="p-3 border-b bg-teal-50">
              <label className="text-xs font-bold text-teal-700 block mb-2">⚡ ඉක්මනින් එක් කරන්න:</label>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_UOMS.filter(cu => !uoms.find(u =>
                  (u.fromUnitName || '').toLowerCase() === cu.name.toLowerCase()
                )).slice(0, 10).map(cu => (
                  <button key={cu.name} type="button" onClick={() => quickAddCommon(cu)} disabled={isSaving}
                    className="px-2 py-1 bg-white border border-teal-200 rounded-lg text-[11px] font-bold text-teal-700 hover:bg-teal-100 disabled:opacity-50">
                    ➕ {cu.name}
                  </button>
                ))}
              </div>
            </div>

            {/* UOM List */}
            <div className="flex-1 overflow-y-auto">
              {uoms.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <div className="text-4xl mb-2">📐</div>
                  <p className="font-medium">UOM නොමැත</p>
                  <p className="text-xs mt-1">ඉහත බටන් එකින් හෝ ➕ නව බටනයෙන් එක් කරන්න</p>
                </div>
              ) : uoms.map(uom => (
                <div key={uom.id} className={`px-4 py-3 border-b hover:bg-gray-50 ${value === uom.id ? 'bg-blue-50' : ''} ${isDeleting === uom.id ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center shrink-0">
                      <span className="text-teal-700 font-bold text-xs">{uom.symbol || uom.fromUnitName?.slice(0, 2)}</span>
                    </div>

                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {
                      onSelect(uom.id, uom.fromUnitName, uom.conversions || []);
                      setIsManageOpen(false);
                    }}>
                      <div className="font-bold text-gray-800">{uom.fromUnitName}</div>
                      {uom.conversions?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {uom.conversions.map((c, i) => (
                            <span key={i} className="bg-teal-50 text-teal-600 text-[9px] px-1.5 py-0.5 rounded font-medium border border-teal-100">
                              1:{c.rate} {c.toUnitName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {value === uom.id && (
                      <span className="bg-blue-600 text-white text-[9px] px-2 py-0.5 rounded-full font-bold shrink-0">✓</span>
                    )}

                    <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(uom); setIsManageOpen(false); }}
                      className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center hover:bg-amber-200 shrink-0">✏️</button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); deleteUom(uom); }} disabled={isDeleting === uom.id}
                      className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center hover:bg-red-200 shrink-0 disabled:opacity-50">🗑️</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-gray-50 border-t text-center">
              <span className="text-xs text-gray-500 font-medium">📊 මුළු UOM: {uoms.length}</span>
            </div>
          </div>
          <style>{`
            @keyframes slideUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
            .animate-slideUp { animation: slideUp 0.3s ease; }
          `}</style>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════ */
export default function ItemFormPage({ mode = 'add', itemId, onSuccess, onCancel }) {
  const { user } = useUserAuth();
  const router   = useRouter();

  const [formData, setFormData] = useState(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(mode === 'edit');
  const [toast, setToast]       = useState(null);

  const [brands, setBrands]             = useState([]);
  const [categories, setCategories]     = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [uoms, setUoms]                 = useState([]);
  const [suppliers, setSuppliers]       = useState([]);
  const [colors, setColors]             = useState([]);
  const [racks, setRacks]               = useState([]);
  const [items, setItems]               = useState([]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const cols = [
      { name: 'brands',        setter: setBrands },
      { name: 'categories',    setter: setCategories },
      { name: 'subCategories', setter: setSubCategories },
      { name: 'uoms',          setter: setUoms },
      { name: 'suppliers',     setter: setSuppliers },
      { name: 'colors',        setter: setColors },
      { name: 'racks',         setter: setRacks },
      { name: 'items',         setter: setItems },
    ];
    const unsubs = cols.map(({ name, setter }) => {
      const q = query(collection(db, name), where('uid', '==', user.uid));
      return onSnapshot(q, (snap) => {
        setter(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [user?.uid]);

  useEffect(() => {
    if (mode !== 'edit' || !itemId || !user?.uid) { setIsLoading(false); return; }
    const loadItem = async () => {
      try {
        const snap = await getDoc(doc(db, 'items', itemId));
        if (snap.exists()) {
          const item = { id: snap.id, ...snap.data() };
          if (item.uid !== user.uid) { showToast('Unauthorized', 'error'); setIsLoading(false); return; }
          const itemImages = Array.isArray(item.images) ? item.images : item.picture ? [item.picture] : [];
          setFormData({ ...INITIAL_FORM, ...item, images: itemImages, imagePaths: Array.isArray(item.imagePaths) ? item.imagePaths : [] });
        }
      } catch (e) { showToast('Item load failed: ' + e.message, 'error'); }
      finally { setIsLoading(false); }
    };
    loadItem();
  }, [mode, itemId, user?.uid, showToast]);

  useEffect(() => {
    if (mode === 'add') {
      setFormData((prev) => ({ ...prev, itemCode: `ITM-${String(items.length + 1).padStart(5, '0')}` }));
    }
  }, [mode, items.length]);

  const handleChange = useCallback((field, value) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      const priceFields = ['sellingPriceRetail','retailDiscount','sellingPriceWholesale','wholesaleDiscount','sellingPriceLoose','looseDiscount'];
      if (priceFields.includes(field)) {
        next.retailYourPrice    = calcNet(next.sellingPriceRetail, next.retailDiscount);
        next.wholesaleYourPrice = calcNet(next.sellingPriceWholesale, next.wholesaleDiscount);
        next.looseYourPrice     = calcNet(next.sellingPriceLoose, next.looseDiscount);
      }
      return next;
    });
  }, []);

  const handleImagesChange = useCallback(({ images, imagePaths }) => {
    setFormData((prev) => ({ ...prev, images, imagePaths }));
  }, []);

  const generateBarcode = useCallback(() => {
    const code = Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    handleChange('barcode', code);
  }, [handleChange]);

  const saveItem = useCallback(async () => {
    if (!formData.name.trim()) { showToast('කරුණාකර නම ඇතුළත් කරන්න', 'error'); return; }
    if (!user) { showToast('Login වී නෑ', 'error'); return; }
    setIsSaving(true);
    try {
      const { id, ...data } = formData;
      const allImages = data.images || [];
      const mainImage = allImages.find(img => img?.startsWith('https://')) || allImages.find(img => img?.startsWith('data:')) || '';
      const payload = {
        ...data, uid: user.uid, images: allImages, imagePaths: data.imagePaths || [],
        imageUrl: mainImage.startsWith('https://') ? mainImage : '', photoURL: mainImage, picture: mainImage,
        uom: data.uomName,
        buyingPrice: Number(data.buyingPrice) || 0,
        sellingPriceRetail: Number(data.sellingPriceRetail) || 0, retailDiscount: Number(data.retailDiscount) || 0, retailYourPrice: Number(data.retailYourPrice) || 0,
        sellingPriceWholesale: Number(data.sellingPriceWholesale) || 0, wholesaleDiscount: Number(data.wholesaleDiscount) || 0, wholesaleYourPrice: Number(data.wholesaleYourPrice) || 0,
        sellingPriceLoose: Number(data.sellingPriceLoose) || 0, looseDiscount: Number(data.looseDiscount) || 0, looseYourPrice: Number(data.looseYourPrice) || 0,
        sellingPrice: Number(data.sellingPriceRetail) || 0,
        minStockLevel: Number(data.minStockLevel) || 0, maxStockLevel: Number(data.maxStockLevel) || 0,
        warrantyType: data.warrantyType || '', warrantyPeriod: data.warrantyPeriod || '', warrantyTerms: data.warrantyTerms || '', warrantyNotes: data.warrantyNotes || '',
        isHidden: data.isHidden || false, isPurchaseOnly: data.isPurchaseOnly || false,
        showPrice: data.showPrice ?? true, showDiscount: data.showDiscount ?? true,
        allowOrderWhenOutOfStock: data.allowOrderWhenOutOfStock || false,
        catalogPriceType: data.catalogPriceType || 'retail', catalogUom: data.catalogUom || data.uomName || '',
      };
      if (mode === 'add') {
        await addDoc(collection(db, 'items'), { ...payload, stock: 0, stocks: { Main_Store: 0 }, createdAt: new Date().toISOString() });
        showToast('සාර්ථකව සුරකින ලදී! ✅');
      } else if (mode === 'edit' && id) {
        await updateDoc(doc(db, 'items', id), { ...payload, updatedAt: new Date().toISOString() });
        showToast('සාර්ථකව යාවත්කාලීන කරන ලදී! ✅');
      }
      setTimeout(() => { if (onSuccess) onSuccess(); else router.back(); }, 1500);
    } catch (e) { showToast('Error: ' + e.message, 'error'); console.error(e); }
    finally { setIsSaving(false); }
  }, [formData, user, mode, onSuccess, showToast, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-28">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="bg-white p-4 sticky top-0 z-10 shadow-sm flex items-center gap-3 border-b">
        <button onClick={onCancel} className="text-xl border-2 rounded-lg px-3 py-1 hover:bg-gray-100">←</button>
        <h1 className="font-bold text-lg">
          {mode === 'add' ? '➕ නව භාණ්ඩයක් එක් කරන්න' : '✏️ භාණ්ඩය සංස්කරණය'}
        </h1>
      </div>

      <div className="p-4 space-y-4">

        {/* VISIBILITY */}
        <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
          <h3 className="font-bold text-purple-800 mb-3 text-base">👁️ පාරිභෝගික දර්ශන සැකසුම්</h3>
          <div className="bg-white p-4 rounded-xl border border-purple-100 divide-y divide-dashed divide-gray-200">
            <ToggleRow label="🚫 සඟවන්න (Hidden)" desc="Catalog එකේ නොපෙනේ"
              checked={formData.isHidden} onChange={(v) => handleChange('isHidden', v)} color="peer-checked:bg-red-600" />
            <ToggleRow label="🚚 මිලදී ගැනීම් පමණි"
              checked={formData.isPurchaseOnly} onChange={(v) => handleChange('isPurchaseOnly', v)} color="peer-checked:bg-orange-500" />
            {!formData.isHidden && !formData.isPurchaseOnly && (
              <>
                <ToggleRow label="💲 මිල පෙන්වන්න" checked={formData.showPrice}
                  onChange={(v) => handleChange('showPrice', v)} color="peer-checked:bg-green-600" />
                <ToggleRow label="🏷️ වට්ටම් පෙන්වන්න" checked={formData.showDiscount}
                  onChange={(v) => handleChange('showDiscount', v)} color="peer-checked:bg-indigo-600" />
                <ToggleRow label="📦 තොග නැතිවිට ඇනවුම් ඉඩ දෙන්න" desc="ON නම් Pre-Order කළ හැක"
                  checked={formData.allowOrderWhenOutOfStock} onChange={(v) => handleChange('allowOrderWhenOutOfStock', v)} color="peer-checked:bg-teal-600" />
              </>
            )}
          </div>
        </div>

        {/* IMAGE UPLOAD */}
        <ImageUploadSection formData={formData} uid={user?.uid} itemId={itemId} onImagesChange={handleImagesChange} />

        {/* BASIC INFO */}
        <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
          <h3 className="font-bold border-b pb-2">📋 මූලික තොරතුරු</h3>
          <div>
            <label className="font-bold text-sm block mb-1">🏷️ භාණ්ඩ කේතය</label>
            <input className="w-full border-2 p-3 rounded-xl bg-gray-100 text-gray-500" value={formData.itemCode} disabled />
          </div>
          <div>
            <label className="font-bold text-sm block mb-1">📊 බාර්කෝඩ්</label>
            <div className="flex gap-2">
              <input className="flex-1 border-2 p-3 rounded-xl" value={formData.barcode}
                onChange={(e) => handleChange('barcode', e.target.value)} placeholder="Barcode..." />
              <button type="button" onClick={generateBarcode}
                className="bg-gray-200 px-4 rounded-xl font-bold hover:bg-gray-300">⚙️</button>
            </div>
          </div>
          <div>
            <label className="font-bold text-sm block mb-1">📝 නම (English) *</label>
            <input className="w-full border-2 p-3 rounded-xl" value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)} placeholder="Item name..." />
          </div>
          <div>
            <label className="font-bold text-sm block mb-1">🇱🇰 සිංහල නම</label>
            <input className="w-full border-2 p-3 rounded-xl" value={formData.sinhalaName}
              onChange={(e) => handleChange('sinhalaName', e.target.value)} placeholder="සිංහල නම..." />
          </div>
          <div>
            <label className="font-bold text-sm block mb-1">🔑 Model / Key Code</label>
            <input className="w-full border-2 p-3 rounded-xl" value={formData.modelKeyCode || ''}
              onChange={(e) => handleChange('modelKeyCode', e.target.value)} />
          </div>
        </div>

        {/* CLASSIFICATION */}
        <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
          <h3 className="font-bold border-b pb-2">📁 වර්ගීකරණය සහ සැකසුම්</h3>

          <SmartSelectWithManage label="සන්නාමය (Brand)" icon="🏷️"
            value={formData.brandId} displayValue={formData.brandName} options={brands}
            onSelect={(id, name) => setFormData(prev => ({ ...prev, brandId: id, brandName: name }))}
            collectionName="brands" uid={user?.uid} showToast={showToast} />

          <SmartSelectWithManage label="වර්ගය (Category)" icon="📁"
            value={formData.categoryId} displayValue={formData.categoryName} options={categories}
            onSelect={(id, name) => setFormData(prev => ({ ...prev, categoryId: id, categoryName: name, subCategoryId: '', subCategoryName: '' }))}
            collectionName="categories" uid={user?.uid} showToast={showToast} />

          <SmartSelectWithManage label="උප වර්ගය (Sub Category)" icon="📂"
            value={formData.subCategoryId} displayValue={formData.subCategoryName} options={subCategories}
            onSelect={(id, name) => setFormData(prev => ({ ...prev, subCategoryId: id, subCategoryName: name }))}
            collectionName="subCategories" uid={user?.uid} showToast={showToast}
            parentFilter={{ field: 'categoryId', value: formData.categoryId }}
            parentRequired={true} parentLabel="වර්ගය (Category)" />

          {/* ★ UOM WITH CREATE BUTTON ★ */}
          <UomSmartSelect
            value={formData.uomId} displayValue={formData.uomName} uoms={uoms}
            onSelect={(id, name, conversions) => setFormData(prev => ({
              ...prev, uomId: id, uomName: name, availableUnits: conversions || [], catalogUom: name || ''
            }))}
            uid={user?.uid} showToast={showToast} />

          <SmartSelectWithManage label="වර්ණය (Color)" icon="🎨"
            value={formData.colorId} displayValue={formData.colorName} options={colors}
            onSelect={(id, name) => setFormData(prev => ({ ...prev, colorId: id, colorName: name }))}
            collectionName="colors" uid={user?.uid} showToast={showToast} colorPicker={true} />

          <SmartSelectWithManage label="රාක්කය (Rack)" icon="🏗️"
            value={formData.rackId} displayValue={formData.rackName} options={racks}
            onSelect={(id, name) => setFormData(prev => ({ ...prev, rackId: id, rackName: name }))}
            collectionName="racks" uid={user?.uid} showToast={showToast}
            extraFields={[{ key: 'code', label: 'රාක්ක කේතය', icon: '🔢' }, { key: 'location', label: 'ස්ථානය', icon: '📍' }]} />

          <SmartSelectWithManage label="සැපයුම්කරු (Supplier)" icon="🚚"
            value={formData.supplierId} displayValue={formData.supplierName} options={suppliers}
            onSelect={(id, name) => setFormData(prev => ({ ...prev, supplierId: id, supplierName: name }))}
            collectionName="suppliers" uid={user?.uid} showToast={showToast}
            extraFields={[{ key: 'phone', label: 'දුරකථන', icon: '📞' }, { key: 'address', label: 'ලිපිනය', icon: '🏠' }]} />
        </div>

        {/* PRICING */}
        <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
          <h3 className="font-bold border-b pb-2">💰 මිල ගණන්</h3>
          <div>
            <label className="font-bold text-sm block mb-1">💵 ගැනුම් මිල</label>
            <input type="number" min="0" step="0.01"
              className="w-full border-2 p-3 rounded-xl bg-yellow-50 font-bold text-lg"
              value={formData.buyingPrice} onChange={(e) => handleChange('buyingPrice', e.target.value)} placeholder="0.00" />
          </div>
          {[
            { key:'retail', label:'සිල්ලර', icon:'🏪', priceF:'sellingPriceRetail', discF:'retailDiscount', netF:'retailYourPrice', bg:'bg-blue-50', border:'border-blue-200' },
            { key:'wholesale', label:'තොග', icon:'🏭', priceF:'sellingPriceWholesale', discF:'wholesaleDiscount', netF:'wholesaleYourPrice', bg:'bg-purple-50', border:'border-purple-200' },
            { key:'loose', label:'ලූස්', icon:'📦', priceF:'sellingPriceLoose', discF:'looseDiscount', netF:'looseYourPrice', bg:'bg-orange-50', border:'border-orange-200' },
          ].map(pt => (
            <div key={pt.key} className={`p-4 rounded-xl border ${pt.bg} ${pt.border}`}>
              <div className="font-bold mb-3">{pt.icon} {pt.label.toUpperCase()}</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-600 block mb-1">මිල</label>
                  <input type="number" min="0" className="w-full border-2 p-2 rounded-lg text-center font-bold"
                    value={formData[pt.priceF]} onChange={(e) => handleChange(pt.priceF, e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">වට්ටම %</label>
                  <input type="number" min="0" max="100" className="w-full border-2 p-2 rounded-lg text-center"
                    value={formData[pt.discF]} onChange={(e) => handleChange(pt.discF, e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 block mb-1">ඔබේ මිල</label>
                  <input type="text" className="w-full border-2 p-2 rounded-lg text-center bg-green-100 font-bold text-green-700"
                    value={formData[pt.netF]} readOnly />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* STOCK */}
        <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
          <h3 className="font-bold border-b pb-2">📊 තොග මට්ටම්</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-bold block mb-1">අවම</label>
              <input type="number" min="0" className="w-full border-2 p-3 rounded-xl"
                value={formData.minStockLevel} onChange={(e) => handleChange('minStockLevel', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-bold block mb-1">උපරිම</label>
              <input type="number" min="0" className="w-full border-2 p-3 rounded-xl"
                value={formData.maxStockLevel} onChange={(e) => handleChange('maxStockLevel', e.target.value)} />
            </div>
          </div>
          <ToggleRow label="💰 VAT අදාළ වේ" desc="මෙම භාණ්ඩයට VAT එකතු කෙරේ"
            checked={formData.vatEnabled} onChange={(v) => handleChange('vatEnabled', v)} color="peer-checked:bg-emerald-600" />
          <textarea className="w-full border-2 p-3 rounded-xl" rows="2" placeholder="විස්තරය..."
            value={formData.description} onChange={(e) => handleChange('description', e.target.value)} />
        </div>

        {/* WARRANTY */}
        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
          <h3 className="font-bold text-amber-800 mb-4 text-base">🛡️ වගකීම් තොරතුරු</h3>
          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-800 mb-2">📋 වගකීම් වර්ගය</label>
            <div className="grid grid-cols-2 gap-2">
              {WARRANTY_TYPES.map(wt => (
                <button key={wt.value} type="button" onClick={() => {
                  handleChange('warrantyType', wt.value);
                  if (!wt.value) { handleChange('warrantyPeriod', ''); handleChange('warrantyTerms', ''); handleChange('warrantyNotes', ''); }
                }} className={`p-3 rounded-xl text-left font-bold text-sm border-2 flex items-center gap-2 transition-all
                  ${formData.warrantyType === wt.value ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-700 border-gray-200 hover:border-amber-300'}`}>
                  <span>{wt.icon}</span><span className="text-xs">{wt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {formData.warrantyType && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-800 mb-2">⏰ වගකීම් කාලය</label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {WARRANTY_PERIODS.map(wp => (
                    <button key={wp.value} type="button" onClick={() => handleChange('warrantyPeriod', wp.value)}
                      className={`flex flex-col items-center px-3 py-2 rounded-xl border-2 font-bold text-xs transition-all
                        ${formData.warrantyPeriod === wp.value ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-200'}`}>
                      <span className="font-black">{wp.label}</span>
                      <span className="text-[9px] opacity-80">{wp.desc}</span>
                    </button>
                  ))}
                </div>
                <input className="w-full border-2 border-amber-200 bg-white p-3 rounded-xl text-sm font-bold text-amber-800 placeholder-amber-300 outline-none focus:border-amber-500"
                  value={formData.warrantyPeriod || ''} onChange={(e) => handleChange('warrantyPeriod', e.target.value)}
                  placeholder="හෝ අතින් ඇතුළු කරන්න: 6 months / 1 year" />
                {formData.warrantyPeriod && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-xl text-center">
                    <div className="text-[10px] text-green-600 font-bold mb-1">✅ කල් ඉකුත් වන දිනය (අදින්)</div>
                    <div className="text-base font-black text-green-800">{calcWarrantyExpiry(formData.warrantyPeriod) || '—'}</div>
                  </div>
                )}
              </div>
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-800 mb-2">📜 වගකීම් කොන්දේසි</label>
                <textarea value={formData.warrantyTerms || ''} onChange={(e) => handleChange('warrantyTerms', e.target.value)}
                  rows={3} className="w-full border-2 border-amber-100 bg-white p-3 rounded-xl text-sm outline-none focus:border-amber-300 resize-y" />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">📝 අමතර සටහන්</label>
                <textarea value={formData.warrantyNotes || ''} onChange={(e) => handleChange('warrantyNotes', e.target.value)}
                  rows={2} className="w-full border-2 border-amber-100 bg-white p-3 rounded-xl text-sm outline-none focus:border-amber-300 resize-y" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* SAVE BUTTONS */}
      <div className="fixed bottom-0 left-0 right-0 bg-white p-4 border-t flex gap-3 z-20 shadow-lg">
        <button onClick={onCancel} className="flex-1 bg-gray-200 py-4 rounded-xl font-bold hover:bg-gray-300">❌ අවලංගු</button>
        <button onClick={saveItem} disabled={isSaving}
          className={`flex-[2] py-4 rounded-xl font-bold text-white disabled:opacity-50
            ${mode === 'edit' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {isSaving ? '⏳ සුරකිමින්...' : mode === 'edit' ? '✅ යාවත්කාලීන කරන්න' : '💾 සුරකින්න'}
        </button>
      </div>
    </div>
  );
}