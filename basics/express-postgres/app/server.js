const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Reads PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE from the environment.
const pool = new Pool();

const SEED = [
  ['widget', 12],
  ['gadget', 5],
  ['sprocket', 27],
  ['bolt', 103],
  ['nut', 88],
];

let initialized = false;

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id       SERIAL PRIMARY KEY,
      name     TEXT NOT NULL,
      quantity INT NOT NULL DEFAULT 0
    )
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM items');
  if (rows[0].n === 0) {
    for (const [name, quantity] of SEED) {
      await pool.query('INSERT INTO items (name, quantity) VALUES ($1, $2)', [name, quantity]);
    }
  }
  initialized = true;
}

// Retry at startup until Postgres is reachable, then seed once.
(async function connectLoop() {
  while (!initialized) {
    try {
      await initDb();
      console.log('database ready');
    } catch (err) {
      console.log('waiting for postgres:', err.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
})();

app.get('/healthz', async (req, res) => {
  try {
    if (!initialized) await initDb();
    res.sendStatus(200);
  } catch (err) {
    initialized = false;
    res.status(503).send('db not ready');
  }
});

app.get('/api/items', async (req, res) => {
  try {
    if (!initialized) await initDb();
    const { rows } = await pool.query('SELECT id, name, quantity FROM items ORDER BY id');
    res.json(rows);
  } catch (err) {
    initialized = false;
    res.status(500).json({ error: err.message });
  }
});

app.get('/', async (req, res) => {
  let rows = [];
  let error = null;
  try {
    if (!initialized) await initDb();
    ({ rows } = await pool.query('SELECT id, name, quantity FROM items ORDER BY id'));
  } catch (err) {
    initialized = false;
    error = err.message;
  }

  const body = error
    ? `<p style="color:#e46">DB error: ${error}</p>`
    : `<table>
        <thead><tr><th>ID</th><th>Name</th><th>Quantity</th></tr></thead>
        <tbody>${rows
          .map((r) => `<tr><td>${r.id}</td><td>${r.name}</td><td>${r.quantity}</td></tr>`)
          .join('')}</tbody>
      </table>`;

  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Items from Postgres</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; background: #0f1115; color: #e6e6e6; }
    h1 { font-weight: 600; }
    table { border-collapse: collapse; margin-top: 1rem; }
    th, td { border: 1px solid #2a2f3a; padding: .5rem 1rem; text-align: left; }
    th { background: #1b1f27; }
  </style>
</head>
<body>
  <h1>Items from Postgres</h1>
  ${body}
</body>
</html>`);
});

app.listen(port, () => console.log(`listening on port ${port}`));
