// authModel.js
import { getPool, sql } from './db.js';
import bcrypt from 'bcryptjs';

export async function findUserByUsername(username) {
  const pool = await getPool();
  const r = await pool.request()
    .input('u', sql.NVarChar(100), username)
    .query(`
      SELECT UserID AS id, Username, PasswordHash, Role
      FROM dbo.Users WHERE Username=@u
    `);
  return r.recordset[0] || null;
}

export async function createUser({ username, password, role = 'user' }) {
  const pool = await getPool();
  const hash = await bcrypt.hash(password, 10);
  const r = await pool.request()
    .input('u', sql.NVarChar(100), username)
    .input('p', sql.NVarChar(255), hash)
    .input('r', sql.NVarChar(20), role)
    .query(`
      INSERT INTO dbo.Users (Username, PasswordHash, Role)
      OUTPUT INSERTED.UserID AS id, INSERTED.Username, INSERTED.Role
      VALUES (@u, @p, @r)
    `);
  return r.recordset[0];
}
