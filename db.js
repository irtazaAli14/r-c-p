
const { Pool } = require('pg');
require('dotenv').config();

// Neon Connection String URL se Direct Pool Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Neon connection ke liye zaroori hai
  },
});

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Database se connect karne me error aya:', err.stack);
  }
  console.log('Neon PostgreSQL se successfully connection ban gaya hai! 🎉');
  release();
});

module.exports = pool;


// const { Pool } = require('pg');
// require('dotenv').config();

// // Database Connection Pool create karna
// const pool = new Pool({
//   user: process.env.DB_USER,
//   host: process.env.DB_HOST,
//   database: process.env.DB_DATABASE,
//   password: process.env.DB_PASSWORD, 
//   port: process.env.DB_PORT,
// });

// // Test connection
// pool.connect((err, client, release) => {
//   if (err) {
//     return console.error('Database se connect karne me error aya:', err.stack);
//   }
//   console.log('Database (randomCall) se successfully connection ban gaya hai! 🎉');
//   release();
// });

// module.exports = pool;