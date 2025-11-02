// productsModel.js
import { getPool, sql } from './db.js';

export async function listProducts() {
  const pool = await getPool();
  const rs = await pool.request().query(`
    SELECT
      p.ProductID     AS id,
      p.ProductName   AS name,
      p.UnitPrice     AS price,
      p.UnitsInStock  AS stock,
      p.ImageURL      AS image_url,
      p.CategoryID    AS category_id,
      p.SupplierID    AS supplier_id,
      p.[Description] AS description,
      p.date_added,
      p.last_updated
    FROM dbo.Products p
    ORDER BY p.ProductID DESC
  `);
  return rs.recordset;
}

export async function createProduct(data) {
  const pool = await getPool();
  const req = pool.request();

  req.input('ProductName',  sql.NVarChar(255),     data.name);
  req.input('UnitPrice',    sql.Decimal(10, 2),    data.price ?? 0);
  req.input('UnitsInStock', sql.Int,               data.stock ?? 0);
  req.input('ImageURL',     sql.NVarChar(sql.MAX), data.image_url ?? null);
  req.input('CategoryID',   sql.Int,               data.category_id ?? null);
  req.input('SupplierID',   sql.Int,               data.supplier_id ?? null);
  req.input('Description',  sql.NVarChar(sql.MAX), data.description ?? null);

  // ✅ เก็บผลลัพธ์ไว้ในตัวแปร rs
  const rs = await req.query(`
    INSERT INTO dbo.Products
      (ProductName, UnitPrice, UnitsInStock, ImageURL, CategoryID, SupplierID, [Description], date_added, last_updated)
    OUTPUT INSERTED.ProductID AS id
    VALUES (@ProductName, @UnitPrice, @UnitsInStock, @ImageURL, @CategoryID, @SupplierID, @Description, SYSDATETIME(), SYSDATETIME());
  `);

  return rs.recordset[0].id;   // ✅ ใช้ rs ที่เพิ่งได้มา
}

export async function updateProduct(id, data, currentUserId = 0) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    // 1) bind UserID ให้ทริกเกอร์อ่าน
    await new sql.Request(tx)
      .input('uid', sql.Int, currentUserId || 0)
      .query(`EXEC sys.sp_set_session_context @key=N'UserID', @value=@uid;`);

    // 2) สร้างคำสั่ง UPDATE เหมือนเดิม แต่ใช้ Request(tx)
    const req = new sql.Request(tx).input('id', sql.Int, id);
    const sets = [];
    if (data.name !== undefined)      { req.input('ProductName',  sql.NVarChar(255),     data.name);        sets.push('ProductName = @ProductName'); }
    if (data.price !== undefined)     { req.input('UnitPrice',    sql.Decimal(10,2),     data.price);       sets.push('UnitPrice = @UnitPrice'); }
    if (data.stock !== undefined)     { req.input('UnitsInStock', sql.Int,               data.stock);       sets.push('UnitsInStock = @UnitsInStock'); }
    if (data.image_url !== undefined) { req.input('ImageURL',     sql.NVarChar(sql.MAX), data.image_url);   sets.push('ImageURL = @ImageURL'); }
    if (data.category_id !== undefined){req.input('CategoryID',   sql.Int,               data.category_id); sets.push('CategoryID = @CategoryID'); }
    if (data.supplier_id !== undefined){req.input('SupplierID',   sql.Int,               data.supplier_id); sets.push('SupplierID = @SupplierID'); }
    if (data.description !== undefined){req.input('Description',  sql.NVarChar(sql.MAX), data.description); sets.push('[Description] = @Description'); }
    sets.push('last_updated = SYSDATETIME()');

    const sqlTxt = `UPDATE dbo.Products SET ${sets.join(', ')} WHERE ProductID = @id;`;
    await req.query(sqlTxt);

    await tx.commit();
    return { id };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

export async function deleteProduct(id) {
  const pool = await getPool();
  await pool.request().input('id', sql.Int, id)
    .query(`DELETE FROM dbo.Products WHERE ProductID=@id;`);
}


export async function getProductQuote(productId, qty) {
  const pool = await getPool();
  const rs = await pool.request()
    .input('id',  sql.Int,      Number(productId))
    .input('qty', sql.SmallInt, Number(qty))
    .query(`
      SELECT
        p.ProductID                                        AS id,
        p.ProductName                                      AS name,
        CAST(p.UnitPrice AS DECIMAL(10,2))                 AS unit_price,
        @qty                                               AS qty,
        CAST(calc.DiscountRate AS DECIMAL(5,4))            AS rate,
        CAST(calc.NetAmount / NULLIF(@qty,0) AS DECIMAL(10,2)) AS net_unit_price,
        CAST(calc.NetAmount AS DECIMAL(10,2))              AS line_total
      FROM dbo.Products p
      CROSS APPLY dbo.fn_CalcLineAmounts(p.UnitPrice, @qty) AS calc
      WHERE p.ProductID = @id;
    `);
  return rs.recordset[0] || null;
}

export async function getTop5Products() {
  const pool = await getPool();
  const rs = await pool.request().execute("dbo.Pro_Top5_Products"); // ✅ เรียก Stored Procedure
  return rs.recordset; // ส่งเฉพาะข้อมูลผลลัพธ์กลับ
}


