#!/usr/bin/env node
// Prints 32 cryptographically random bytes, base64-encoded (equivalent to `openssl rand -base64 32`).
import { randomBytes } from 'node:crypto';

console.log(randomBytes(32).toString('base64'));
