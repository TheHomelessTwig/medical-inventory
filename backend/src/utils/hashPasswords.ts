/**
 * Run this script to regenerate bcrypt hashes for seed.sql
 * npx ts-node src/utils/hashPasswords.ts
 */
import bcrypt from 'bcryptjs';

const passwords = [
  { label: 'Admin123!', value: 'Admin123!' },
  { label: 'Doctor123!', value: 'Doctor123!' },
  { label: 'Nurse123!', value: 'Nurse123!' },
];

async function main() {
  for (const p of passwords) {
    const hash = await bcrypt.hash(p.value, 12);
    console.log(`${p.label}: ${hash}`);
  }
}

main();
