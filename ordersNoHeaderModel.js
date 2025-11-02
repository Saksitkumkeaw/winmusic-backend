
// ordersNoHeaderModel.js (เวอร์ชันให้ Trigger ทำงาน)
import { getPool, sql } from './db.js';

export async function checkoutNoHeader({ items = [], currentUserId = 0 }) {
    if (!Array.isArray(items) || items.length === 0) {
        const e = new Error('Order items is empty');
        e.http = 400;
        throw e;
    }

    // ทำให้แน่ใจว่า id/qty เป็นตัวเลขถูกต้อง
    items = items
        .map(x => ({ product_id: Number(x.product_id), quantity: Number(x.quantity) }))
        .filter(x => x.product_id > 0 && x.quantity > 0);

    const pool = await getPool();
    const tx = new sql.Transaction(pool);

    try {
        await tx.begin();

        // ผูก user context เพื่อให้ trigger รู้ว่าใครเป็นคนทำ (ถ้ามีใช้ใน trigger อื่น)
        await new sql.Request(tx)
            .input('uid', sql.Int, currentUserId || 0)
            .query(`EXEC sys.sp_set_session_context @key=N'UserID', @value=@uid;`);

        // สร้างหมายเลขออเดอร์
        const rSeq = await new sql.Request(tx).query(`
      SELECT NEXT VALUE FOR dbo.OrderIdSeq AS orderId;
    `);
        const orderId = rSeq.recordset[0]?.orderId;
        if (!orderId) throw new Error('OrderIdSeq not available');

        // วนทุกสินค้า
        for (const { product_id: pid, quantity: qty } of items) {
            // 1) อ่านราคา + สต็อกล่าสุด (เพื่อบันทึกราคา)
            const r = await new sql.Request(tx)
                .input('pid', sql.Int, pid)
                .query(`
          SELECT CAST(UnitPrice AS DECIMAL(10,2)) AS UnitPrice,
                 CAST(UnitsInStock AS INT) AS UnitsInStock
          FROM dbo.Products WHERE ProductID=@pid;
        `);
            if (r.recordset.length === 0)
                throw new Error(`Product not found: ${pid}`);

            const { UnitPrice: unitPrice } = r.recordset[0];

            // 2) แทรกรายการออเดอร์
            await new sql.Request(tx)
                .input('oid', sql.Int, orderId)
                .input('pid', sql.Int, pid)
                .input('qty', sql.SmallInt, qty)
                .input('price', sql.Decimal(10, 2), unitPrice)
                .query(`
          INSERT INTO dbo.[Order Details] (OrderID, ProductID, UnitPrice, Quantity, Discount)
          SELECT @oid, @pid, @price, @qty, calc.DiscountRate
          FROM dbo.fn_CalcLineAmounts(@price, @qty) AS calc;
        `);

            // 3) อัปเดต stock → ให้ trigger ตรวจว่าติดลบไหม
            // ❌ ไม่เช็คใน JS แล้ว ปล่อยให้ TRIGGER dbo.TRG_Products_BlockOversell ทำงานเอง
            await new sql.Request(tx)
                .input('pid', sql.Int, pid)
                .input('qty', sql.SmallInt, qty)
                .query(`
          UPDATE dbo.Products
          SET UnitsInStock = UnitsInStock - @qty,
              last_updated = SYSDATETIME()
          WHERE ProductID = @pid;
        `);
            // ถ้า trigger เจอ UnitsInStock < 0 → จะ THROW และไปเข้า catch ด้านล่างอัตโนมัติ
        }

        await tx.commit();
        return { orderId }; // ✅ สำเร็จ
    } catch (err) {
        try { await tx.rollback(); } catch { }
        const sqlMsg = err?.originalError?.info?.message || '';
        let msg = sqlMsg || err.message || 'Checkout failed';

        // ✅ ถ้า trigger ส่งข้อความเกี่ยวกับ stock
        if (msg.includes('BlockOversell') || msg.includes('UnitsInStock')) {
            msg = '❌ ไม่สามารถสั่งซื้อได้: สินค้าในสต็อกไม่เพียงพอ';
        }

        const e = new Error(msg);
        e.http = 400;
        throw e;
    }
}

export async function getOrderItems(orderId) {
    const pool = await getPool();
    const rs = await pool.request()
        .input('oid', sql.Int, orderId)
        .query(`
      SELECT
        od.ProductID AS id,
        p.ProductName AS name,
        CAST(od.UnitPrice AS DECIMAL(10,2)) AS unit_price,
        od.Quantity AS qty,
        CAST(od.Discount AS DECIMAL(5,4)) AS rate,
        CAST((od.UnitPrice * od.Quantity) * od.Discount AS DECIMAL(10,2)) AS discount_amount,
        CAST((od.UnitPrice * od.Quantity) * (1 - od.Discount) AS DECIMAL(10,2)) AS line_total,
        p.ImageURL AS image_url
      FROM dbo.[Order Details] od
      JOIN dbo.Products p ON p.ProductID = od.ProductID
      WHERE od.OrderID = @oid
      ORDER BY od.ProductID;
    `);
    return rs.recordset;
}


export async function previewAfterDiscountByOrderId(orderId) {
    const pool = await getPool();
    const req = pool.request().input('OrderID', sql.Int, Number(orderId));

    // โปรซีเจอร์คืน 2 ชุดผลลัพธ์: [0] รายการแต่ละชิ้น, [1] สรุปยอดรวม
    // ใช้รูปแบบ EXEC เพื่อให้ mssql เก็บหลาย resultsets
    const rs = await req.query(`
    EXEC dbo.usp_PreviewAfterDiscountByOrderID @OrderID;
  `);

    const items = rs.recordsets?.[0] ?? [];
    const summaryRow = rs.recordsets?.[1]?.[0] ?? null;

    // จัดทรงข้อมูลให้อ่านง่ายในฝั่ง Frontend
    const summary = summaryRow
        ? {
            order_id: summaryRow.OrderID,
            subtotal: Number(summaryRow.Subtotal),
            discount_total: Number(summaryRow.TotalDiscount),
            grand_total: Number(summaryRow.GrandTotal),
        }
        : { order_id: Number(orderId), subtotal: 0, discount_total: 0, grand_total: 0 };

    // ปรับเลขเป็น number
    const normalizedItems = items.map(x => ({
        order_id: x.OrderID,
        product_id: x.ProductID,
        name: x.ProductName,
        unit_price: Number(x.UnitPrice),
        qty: x.Quantity,
        rate: Number(x.DiscountRate),          // 0–1
        discount_amount: Number(x.DiscountAmount),
        line_total: Number(x.NetAmount),
    }));

    return { items: normalizedItems, summary };
}
