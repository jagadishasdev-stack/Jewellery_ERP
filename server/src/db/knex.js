// node-postgres's default parsing of a `date`-typed column (OID 1082)
// constructs a JS Date at LOCAL midnight, then represents it as a UTC
// instant — so `.toISOString()` on it shows the PREVIOUS calendar day for
// any positive UTC offset (India is UTC+5:30). Found by actually
// generating Tally XML and a financial report and inspecting the real
// output: an Entry_Date of 2026-08-11 came back as the JS Date
// 2026-08-10T18:30:00.000Z, which every `.toISOString().slice(0,10)` call
// anywhere in this app would silently read as the wrong day. Registered
// globally on the `pg` package (not just this one knex instance) so every
// connection this app ever opens — including tenantDbResolver.js's
// per-tenant pools for tenants on their own database — is fixed the same
// way: return the raw 'YYYY-MM-DD' string Postgres actually sent, no
// timezone conversion, no ambiguity.
require('pg').types.setTypeParser(1082, (val) => val);

const knex = require('knex');
const knexConfig = require('./knexfile');

const env = process.env.NODE_ENV || 'development';
const db = knex(knexConfig[env]);

// Test connection on startup
db.raw('SELECT 1')
  .then(() => console.log('✅ PostgreSQL connected successfully'))
  .catch((err) => console.error('❌ PostgreSQL connection failed:', err.message));

module.exports = db;
