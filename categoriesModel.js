// categoriesModel.js
import { getPool, sql } from './db.js';

// ✅ ดึงข้อมูลทั้งหมด
export async function listCategories() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT CategoryID, CategoryName
    FROM dbo.Categories
    ORDER BY CategoryID DESC
  `);
  return result.recordset;
}

// ✅ สร้าง Category ใหม่
export async function createCategory({ CategoryName }) {
  const pool = await getPool();
  const req = pool.request()
    .input('CategoryName', sql.NVarChar(255), CategoryName);

  const rs = await req.query(`
    INSERT INTO Categories (CategoryName)
    OUTPUT INSERTED.CategoryID AS id
    VALUES (@CategoryName);
  `);
  return rs.recordset[0]; // { id: ... }
}

// ✅ อ่าน Category ตาม ID
export async function getCategoryById(id) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.Int, id)
    .query(`
      SELECT
        CategoryID   AS id,
        CategoryName
      FROM dbo.Categories
      WHERE CategoryID = @id
    `);
  return r.recordset[0] || null;
}

// ✅ อัปเดต Category
export async function updateCategory(id, { CategoryName }) {
  const pool = await getPool();
  const req = pool.request()
    .input('id', sql.Int, id)
    .input('CategoryName', sql.NVarChar(255), CategoryName);

  await req.query(`
    UPDATE Categories
    SET CategoryName = @CategoryName
    WHERE CategoryID = @id;
  `);
  return { id };
}
