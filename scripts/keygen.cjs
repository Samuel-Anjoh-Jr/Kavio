#!/usr/bin/env node
// Generates JWT signing secrets and a VAPID (web-push) key pair for the root .env.
'use strict';

const crypto = require('node:crypto');

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jwtSecret() {
  return crypto.randomBytes(64).toString('base64');
}

function vapidKeyPair() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();

  let privateKey = ecdh.getPrivateKey();
  if (privateKey.length < 32) {
    const padded = Buffer.alloc(32);
    privateKey.copy(padded, 32 - privateKey.length);
    privateKey = padded;
  }

  return {
    publicKey: base64url(ecdh.getPublicKey()),
    privateKey: base64url(privateKey),
  };
}

const vapid = vapidKeyPair();

const lines = [
  `JWT_ACCESS_SECRET=${jwtSecret()}`,
  `JWT_REFRESH_SECRET=${jwtSecret()}`,
  // Keys the digests of OTP codes, refresh tokens and reset tokens, so a stolen
  // database dump holds nothing replayable on its own.
  `AUTH_SECRET_PEPPER=${jwtSecret()}`,
  // Encrypts the Auth.js session cookie in apps/web.
  `AUTH_SECRET=${jwtSecret()}`,
  `VAPID_PUBLIC_KEY=${vapid.publicKey}`,
  `VAPID_PRIVATE_KEY=${vapid.privateKey}`,
];

console.log('# Generated secrets — paste into your root .env (never commit them):\n');
console.log(lines.join('\n'));
