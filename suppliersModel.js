// suppliersModel.js
import { getPool, sql } from './db.js';

export async function createSupplier({
  CompanyName,
  ContactName = null,
  Address = null,
  PostalCode = null,
  Country = null,
}) {
  const pool = await getPool();
  const req = pool.request();

  req.input('CompanyName', sql.NVarChar(255), CompanyName);
  req.input('ContactName', sql.NVarChar(255), ContactName);
  req.input('Address', sql.NVarChar(sql.MAX), Address);
  req.input('PostalCode', sql.NVarChar(20), PostalCode);
  req.input('Country', sql.NVarChar(100), Country);

  const rs = await req.query(`
    INSERT INTO dbo.Suppliers (CompanyName, ContactName, [Address], PostalCode, Country)
    OUTPUT INSERTED.SupplierID AS id
    VALUES (@CompanyName, @ContactName, @Address, @PostalCode, @Country);
  `);

  return rs.recordset[0]; // ✅ จะได้ { id: <new_id> }
}

// ✅ เพิ่มฟังก์ชันอ่านตาม id
export async function getSupplierById(id) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.Int, id)
    .query(`
      SELECT
        SupplierID  AS id,
        CompanyName,
        ContactName,
        [Address],
        PostalCode,
        Country
      FROM dbo.Suppliers
      WHERE SupplierID=@id
    `);
  return r.recordset[0] || null;
}

// ✅ เพิ่มฟังก์ชันอัปเดต
export async function updateSupplier(
  id,
  { CompanyName = null, ContactName = null, Address = null, PostalCode = null, Country = null }
) {
  const pool = await getPool();
  const req = pool.request();

  req.input('id',          sql.Int, id);
  req.input('CompanyName', sql.NVarChar(255),  CompanyName ?? null);
  req.input('ContactName', sql.NVarChar(255),  ContactName ?? null);
  req.input('Address',     sql.NVarChar(sql.MAX), Address ?? null);
  req.input('PostalCode',  sql.NVarChar(20),   PostalCode ?? null);
  req.input('Country',     sql.NVarChar(100),  Country ?? null);

  await req.query(`
    UPDATE dbo.Suppliers
    SET CompanyName = @CompanyName,
        ContactName = @ContactName,
        [Address]   = @Address,
        PostalCode  = @PostalCode,
        Country     = @Country
    WHERE SupplierID = @id;
  `);

  return { id };
}
