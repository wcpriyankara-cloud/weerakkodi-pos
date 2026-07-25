'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');

// Initialize once
initializeApp();

// Health check
exports.healthCheck = onRequest((req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});