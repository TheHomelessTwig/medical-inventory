/**
 * Per-file setup — runs once per test file in each worker.
 * The database already exists (created by globalSetup.ts).
 * We only need to point the app pool at the test DB.
 */
import dotenv from 'dotenv';
dotenv.config();

// Tell the app's db.ts to connect to the test database
process.env.DB_NAME = 'medical_inventory_test';
process.env.NODE_ENV = 'test';
