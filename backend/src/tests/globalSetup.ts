/**
 * Vitest globalSetup — runs ONCE before all test files, in the main thread.
 * Creates the test database, applies the schema, seeds users.
 * Tears down the database after all tests finish.
 */
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const TEST_DB = 'medical_inventory_test';

const adminPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: 'postgres',           // always exists
  user: process.env.DB_USER || 'medinv',
  password: process.env.DB_PASSWORD || 'changeme',
  connectionTimeoutMillis: 5000,
});

export async function setup() {
  try {
    // Terminate any stale connections to the test DB, then drop & recreate
    await adminPool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid()
    `);
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await adminPool.query(`CREATE DATABASE ${TEST_DB}`);

    // Connect to the new test DB and apply schema
    const testPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: TEST_DB,
      user: process.env.DB_USER || 'medinv',
      password: process.env.DB_PASSWORD || 'changeme',
    });

    const schema = fs.readFileSync(
      path.resolve(__dirname, '../../src/schema.sql'), 'utf8'
    );
    await testPool.query(schema);

    // Seed test users
    const [adminHash, doctorHash, nurseHash] = await Promise.all([
      bcrypt.hash('Admin123!', 10),
      bcrypt.hash('Doctor123!', 10),
      bcrypt.hash('Nurse123!', 10),
    ]);

    await testPool.query(`
      INSERT INTO users (email, name, password_hash, role) VALUES
        ('admin@test.local',  'Test Admin',  $1, 'admin'),
        ('doctor@test.local', 'Test Doctor', $2, 'doctor'),
        ('nurse@test.local',  'Test Nurse',  $3, 'nurse')
      ON CONFLICT (email) DO NOTHING
    `, [adminHash, doctorHash, nurseHash]);

    await testPool.query(`
      INSERT INTO categories (name, color) VALUES ('Vaccines', '#10b981')
      ON CONFLICT (name) DO NOTHING
    `);
    await testPool.query(`
      INSERT INTO suppliers (name) VALUES ('Test Supplier')
      ON CONFLICT DO NOTHING
    `);

    await testPool.end();
    console.log(`\n[Test DB] "${TEST_DB}" ready\n`);
  } catch (err) {
    console.error('\n[Test DB setup failed]', err);
    console.error('Make sure PostgreSQL is running:  docker compose up postgres -d\n');
    throw err;
  }
}

export async function teardown() {
  try {
    // Give workers a moment to close their pools
    await new Promise(r => setTimeout(r, 500));
    await adminPool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid()
    `);
    await adminPool.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    console.log(`\n[Test DB] "${TEST_DB}" dropped\n`);
  } catch {
    // Non-fatal — the DB will be dropped on next test run
  } finally {
    await adminPool.end();
  }
}
