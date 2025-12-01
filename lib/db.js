const mysql = require('mysql2/promise');

const config = new URL(process.env.DATABASE_URL);

const pool = mysql.createPool({
  host: config.hostname,
  port: config.port,
  user: config.username,
  password: config.password,
  database: config.pathname.slice(1),
  waitForConnections: true,
  connectionLimit: 10,
});

pool.on('connection', (connection) => {
  console.log('DB Connection established');
});

module.exports = {
  pool,
};