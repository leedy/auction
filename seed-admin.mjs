#!/usr/bin/env node
import { loadEnv } from './src/env.mjs';
loadEnv();

import mongoose from 'mongoose';
import { connectDB } from './src/db.mjs';
import { createAdmin, resetPassword, normalizeEmail, AuthError } from './src/auth.mjs';

function usage() {
  console.error('Usage:');
  console.error('  node seed-admin.mjs <email>            # create the admin (refuses if any user exists)');
  console.error('  node seed-admin.mjs --reset <email>    # reset password on an existing user');
  process.exit(2);
}

function readPassword(prompt) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('seed-admin must be run from a TTY for password input'));
      return;
    }
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    let pw = '';
    const onData = (chunk) => {
      const s = chunk.toString('utf8');
      for (const ch of s) {
        const code = ch.charCodeAt(0);
        if (code === 0x0d || code === 0x0a) {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(pw);
          return;
        }
        if (code === 0x03) {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (code === 0x7f || code === 0x08) {
          pw = pw.slice(0, -1);
          continue;
        }
        if (code < 0x20) continue;
        pw += ch;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function promptForPassword() {
  const a = await readPassword('Password (min 5 chars): ');
  const b = await readPassword('Confirm password:       ');
  if (a !== b) {
    console.error('passwords do not match');
    process.exit(1);
  }
  return a;
}

async function main() {
  const args = process.argv.slice(2);
  let reset = false;
  let emailArg = null;
  for (const a of args) {
    if (a === '--reset' || a === '-r') reset = true;
    else if (a === '--help' || a === '-h') usage();
    else if (a.startsWith('-')) {
      console.error(`unknown flag: ${a}`);
      usage();
    } else if (emailArg === null) emailArg = a;
    else usage();
  }
  if (!emailArg) usage();

  let email;
  try {
    email = normalizeEmail(emailArg);
  } catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
  }

  await connectDB();
  try {
    const password = await promptForPassword();
    if (reset) {
      const user = await resetPassword({ email, password });
      console.log(`password reset for ${user.email}`);
    } else {
      const user = await createAdmin({ email, password });
      console.log(`created admin ${user.email}`);
    }
  } catch (err) {
    if (err instanceof AuthError) {
      console.error(`error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
