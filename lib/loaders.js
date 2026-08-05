// lib/loaders.js

import {
  collection, getDocs, query, where, updateDoc, doc, getDoc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { tsMs } from '../components/production/utils';

export async function loadAllEntries(uid, email) {
  if (!uid) return { entries: [], oldCount: 0 };
  const map = new Map();
  let old = 0;

  try {
    (await getDocs(
      query(collection(db, 'productionEntries'), where('uid', '==', uid))
    )).docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
  } catch {}

  if (email) {
    try {
      (await getDocs(
        query(collection(db, 'productionEntries'), where('createdBy', '==', email))
      )).docs.forEach((d) => {
        if (!map.has(d.id)) {
          const data = d.data();
          map.set(d.id, { id: d.id, ...data, _old: !data.uid });
          if (!data.uid) old++;
        }
      });
    } catch {}
  }

  try {
    (await getDocs(
      query(collection(db, 'productionEntries'), where('createdBy', '==', uid))
    )).docs.forEach((d) => {
      if (!map.has(d.id)) {
        const data = d.data();
        map.set(d.id, { id: d.id, ...data, _old: !data.uid });
        if (!data.uid) old++;
      }
    });
  } catch {}

  const entries = Array.from(map.values());
  entries.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));

  if (old > 0) {
    for (const e of entries) {
      if (!e.uid || e._old) {
        try {
          await updateDoc(doc(db, 'productionEntries', e.id), { uid });
          e.uid  = uid;
          e._old = false;
          old    = Math.max(0, old - 1);
        } catch {}
      }
    }
  }

  return { entries, oldCount: old };
}

export async function loadAllItems(uid, email) {
  if (!uid) return [];
  const map = new Map();

  try {
    (await getDocs(
      query(collection(db, 'items'), where('uid', '==', uid))
    )).docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
  } catch {}

  if (map.size === 0) {
    try {
      (await getDocs(collection(db, 'items'))).docs.forEach((d) => {
        const data = d.data();
        if (
          !data.uid || data.uid === uid ||
          data.createdBy === email ||
          data.createdBy === uid ||
          !data.createdBy
        ) {
          map.set(d.id, { id: d.id, ...data });
          if (!data.uid)
            updateDoc(doc(db, 'items', d.id), { uid }).catch(() => {});
        }
      });
    } catch {}
  }

  return Array.from(map.values());
}

export async function loadInvoiceSettings(uid) {
  if (!uid) return null;
  try {
    const snap = await getDocs(
      query(collection(db, 'invoice_settings'), where('uid', '==', uid))
    );
    if (!snap.empty) return snap.docs[0].data();
    const genDoc = await getDoc(doc(db, 'generalSettings', uid));
    if (genDoc.exists()) return genDoc.data();
  } catch (e) {
    console.warn('loadInvoiceSettings:', e.message);
  }
  return null;
}