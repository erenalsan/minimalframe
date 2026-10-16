// Run: node src/lib/exifCleaner.test.js
import assert from 'node:assert/strict';
import { cleanCamera, cleanLens } from './exifCleaner.js';

const cameras = {
  'ILCE-7RM4': 'Sony A7R IV',
  'ILCE-7M3': 'Sony A7 III',
  'ILCE-7C': 'Sony A7C',
  'X-T4': 'Fujifilm X-T4',
  'Canon EOS 5D Mark IV': 'Canon 5D Mark IV',
  'NIKON Z 6_2': 'Nikon Z6 II',
  // What exifr actually gives us: Make and Model joined.
  'SONY ILCE-7RM4': 'Sony A7R IV',
  'SONY ILCE-6400': 'Sony A6400',
  'SONY DSC-RX100M7': 'Sony RX100 VII',
  'FUJIFILM X-T5': 'Fujifilm X-T5',
  'Canon Canon EOS R5': 'Canon R5',
  'NIKON CORPORATION NIKON Z 6_2': 'Nikon Z6 II',
  'NIKON CORPORATION NIKON D850': 'Nikon D850',
  'Apple iPhone 15 Pro': 'iPhone 15 Pro',
  'Leica Camera AG LEICA Q2': 'Leica Q2',
  'Acme Cam 3000': 'Acme Cam 3000', // unknown: left alone
  '': '',
};
for (const [raw, want] of Object.entries(cameras)) assert.equal(cleanCamera(raw), want, raw);

const lenses = {
  'FE 24-70mm F2.8 GM': 'Sony FE 24-70mm f/2.8 GM',
  'EF50mm f/1.8 STM': 'Canon EF 50mm f/1.8 STM',
  'XF35mmF2 R WR': 'Fujifilm XF 35mm f/2 R WR',
  'RF24-105mm F4 L IS USM': 'Canon RF 24-105mm f/4 L IS USM',
  'E 16-50mm F3.5-5.6 OSS': 'Sony E 16-50mm f/3.5-5.6 OSS',
  '24-70mm F2.8 DG DN | Art 019': '24-70mm f/2.8 DG DN | Art 019', // no mount prefix: no brand guessed
  'Sigma 35mm F1.4 DG HSM | Art': 'Sigma 35mm f/1.4 DG HSM | Art',
  'NIKKOR Z 50mm f/1.8 S': 'NIKKOR Z 50mm f/1.8 S',
  '': '',
};
for (const [raw, want] of Object.entries(lenses)) assert.equal(cleanLens(raw), want, raw);

// Cleaning is idempotent, so already-clean names typed by hand stay as they are.
for (const want of Object.values(cameras)) assert.equal(cleanCamera(want), want, want);
for (const want of Object.values(lenses)) assert.equal(cleanLens(want), want, want);
console.log('exifCleaner: OK');
