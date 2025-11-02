// db.js
import sql from 'mssql';
import 'dotenv/config';

const config = {
  server: process.env.DB_SERVER,          // ชื่อเครื่อง/IP
  port:   Number(process.env.DB_PORT || 1433),
  user:   process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true'
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

let poolPromise;
export const getPool = async () => {
  if (!poolPromise) {
    poolPromise = sql.connect(config)
      .then(pool => {
        console.log('✅ MSSQL connected');
        return pool;
      })
      .catch(err => {
        console.error('❌ MSSQL connection error:', err);
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
};

export { sql };
