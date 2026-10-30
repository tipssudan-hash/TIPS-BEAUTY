import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    TEST_TAG,
    cleanupTestOrders,
    createTestOrder,
    creds,
    haveCreds,
    loose,
    pickZone,
    provisionProduct,
    rpc,
    signedInClient,
    type Client,
    type LooseRow,
} from './helpers';

const suite = haveCreds ? describe : describe.skip;

type ProductRow = { id: string; stock: number; average_cost: number | null; cost_price: number | null };

const today = () => new Date().toISOString().slice(0, 10);
const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const idOf = (row: LooseRow | null | undefined): string => {
    if (!row || typeof row.id !== 'string') throw new Error('Expected a row with an id');
    return row.id;
};

const stringField = (row: LooseRow | null | undefined, field: string): string => {
    const value = row?.[field];
    if (typeof value !== 'string') throw new Error(`Expected ${field} to be a string`);
    return value;
};

const expectedAverage = (before: ProductRow, quantity: number, unitCost: number): number => {
    const oldQuantity = Math.max(Number(before.stock ?? 0), 0);
    const oldCost = Number(before.average_cost ?? before.cost_price ?? unitCost);
    return (oldQuantity * oldCost + quantity * unitCost) / (oldQuantity + quantity);
};

suite('purchase invoices, suppliers, supplier returns and void (live backend)', () => {
    let admin: Client;
    let manager: Client;
    let shopper: Client;
    let managerId: string;
    let krtId: string;
    let pzuId: string;
    let product: { id: string; warehouseId: string; release: () => Promise<void> };
    let supplierId: string;
    let supplierName: string;
    let zone: { name: string; state: string | null; fee: number };
    let invoiceA: string;
    let invoiceB: string;
    let returnedItemId: string;

    const getProduct = async (): Promise<ProductRow> => {
        const { data, error } = await rpc(admin, 'get_admin_product', { p_product_id: product.id });
        if (error) throw error;
        return (data as unknown as ProductRow[])[0];
    };

    const readQty = async (warehouseId: string): Promise<number> => {
        const { data, error } = await loose(admin)
            .from('warehouse_inventory')
            .select('quantity')
            .eq('warehouse_id', warehouseId)
            .eq('product_id', product.id);
        if (error) throw error;
        return Number(data?.[0]?.quantity ?? 0);
    };

    const attachFile = async (uploader: Client, warehouseId: string, invoiceId: string) => {
        const path = `${warehouseId}/${invoiceId}/${stamp()}.pdf`;
        const upload = await uploader.storage
            .from('purchase-invoices')
            .upload(path, new Blob(['%PDF-1.4 automated test'], { type: 'application/pdf' }), { contentType: 'application/pdf' });
        if (upload.error) throw upload.error;
        const { error } = await rpc(uploader, 'add_purchase_invoice_attachment', { p_invoice_id: invoiceId, p_storage_path: path });
        if (error) throw error;
    };

    const draftReceipt = async (quantity: number, unitCost: number, ref: string): Promise<string> => {
        const { data, error } = await rpc(manager, 'save_purchase_invoice_draft', {
            p_supplier_id: supplierId,
            p_warehouse_id: krtId,
            p_invoice_date: today(),
            p_items: [{ product_id: product.id, quantity, unit_cost: unitCost }],
            p_supplier_invoice_ref: `${TEST_TAG}-${ref}-${stamp()}`,
        });
        if (error) throw error;
        return data as unknown as string;
    };

    const receive = async (quantity: number, unitCost: number, ref: string): Promise<string> => {
        const invoiceId = await draftReceipt(quantity, unitCost, ref);
        await attachFile(manager, krtId, invoiceId);
        const { error } = await rpc(manager, 'approve_purchase_invoice', { p_invoice_id: invoiceId });
        if (error) throw error;
        return invoiceId;
    };

    beforeAll(async () => {
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        manager = await signedInClient(creds.customer.email, creds.customer.password);
        shopper = await signedInClient(creds.customer.email, creds.customer.password);
        const user = await manager.auth.getUser();
        if (!user.data.user) throw new Error('Test customer did not resolve');
        managerId = user.data.user.id;

        const krt = await admin.from('warehouses').select('id').eq('code', 'KRT').single();
        if (krt.error) throw krt.error;
        krtId = krt.data.id;
        const pzu = await admin.from('warehouses').select('id').eq('code', 'PZU').single();
        if (pzu.error) throw pzu.error;
        pzuId = pzu.data.id;

        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        zone = await pickZone(manager);

        const access = await rpc(admin, 'admin_set_warehouse_manager_access', {
            p_user_id: managerId,
            p_warehouse_ids: [krtId],
            p_primary_warehouse_id: krtId,
        });
        if (access.error) throw access.error;

        supplierName = `${TEST_TAG} supplier ${stamp()}`;
        const supplier = await rpc(manager, 'staff_save_supplier', { p_name: supplierName, p_phone: '0911111111' });
        if (supplier.error) throw supplier.error;
        supplierId = supplier.data as unknown as string;
    });

    afterAll(async () => {
        if (!admin) return;
        await cleanupTestOrders(admin);
        if (invoiceA) await rpc(admin, 'void_purchase_invoice', { p_invoice_id: invoiceA, p_reason: `${TEST_TAG} cleanup` });
        if (supplierId) await rpc(admin, 'staff_save_supplier', { p_name: supplierName, p_id: supplierId, p_is_active: false });
        if (managerId) await rpc(admin, 'admin_set_warehouse_supervisor', { p_user_id: managerId, p_warehouse_id: null });
        await product?.release();
    });

    it('a manager receipt increases stock, writes a purchase_receipt movement and sets the weighted average', async () => {
        const before = await getProduct();
        const krtBefore = await readQty(krtId);

        invoiceA = await receive(10, 5, 'A');

        expect(await readQty(krtId)).toBe(krtBefore + 10);
        const after = await getProduct();
        expect(after.stock).toBe(before.stock + 10);
        expect(after.average_cost).toBeCloseTo(expectedAverage(before, 10, 5), 3);

        const { data: movements, error } = await loose(admin)
            .from('inventory_movements')
            .select('movement_type,quantity_delta,unit_cost')
            .eq('reference_id', invoiceA);
        expect(error).toBeNull();
        expect(movements).toHaveLength(1);
        expect(movements?.[0]).toMatchObject({ movement_type: 'purchase_receipt', quantity_delta: 10 });
        expect(Number(movements?.[0].unit_cost)).toBeCloseTo(5, 3);
    });

    it('a second receipt at a different cost moves the average to the manual weighted figure', async () => {
        const before = await getProduct();
        invoiceB = await receive(10, 9, 'B');
        const after = await getProduct();
        expect(after.average_cost).toBeCloseTo(expectedAverage(before, 10, 9), 3);
        expect(after.average_cost).not.toBeCloseTo(Number(before.average_cost), 3);
    });

    it('refuses to approve a PZU invoice for a manager who only covers KRT', async () => {
        const { data, error: draftError } = await rpc(admin, 'save_purchase_invoice_draft', {
            p_supplier_id: supplierId,
            p_warehouse_id: pzuId,
            p_invoice_date: today(),
            p_items: [{ product_id: product.id, quantity: 1, unit_cost: 2 }],
            p_supplier_invoice_ref: `${TEST_TAG}-PZU-${stamp()}`,
        });
        expect(draftError).toBeNull();
        const pzuInvoice = data as unknown as string;
        await attachFile(admin, pzuId, pzuInvoice);

        const { error } = await rpc(manager, 'approve_purchase_invoice', { p_invoice_id: pzuInvoice });
        expect(error?.message).toMatch(/outside your warehouse scope/);

        await rpc(admin, 'void_purchase_invoice', { p_invoice_id: pzuInvoice, p_reason: `${TEST_TAG} PZU scope test` });
    });

    it('refuses a manager upload of a supplier file into the PZU folder', async () => {
        const path = `${pzuId}/${invoiceA}/${stamp()}.pdf`;
        const upload = await manager.storage
            .from('purchase-invoices')
            .upload(path, new Blob(['%PDF-1.4 automated test'], { type: 'application/pdf' }), { contentType: 'application/pdf' });
        expect(upload.error).not.toBeNull();
    });

    it('refuses approval without an attached supplier file', async () => {
        const invoiceId = await draftReceipt(1, 1, 'NOFILE');
        const { error } = await rpc(manager, 'approve_purchase_invoice', { p_invoice_id: invoiceId });
        expect(error?.message).toMatch(/Attach the supplier invoice file/);
        await rpc(manager, 'void_purchase_invoice', { p_invoice_id: invoiceId, p_reason: `${TEST_TAG} no file` });
    });

    it('refuses a second approval of the same invoice', async () => {
        const { error } = await rpc(manager, 'approve_purchase_invoice', { p_invoice_id: invoiceA });
        expect(error?.message).toMatch(/Only draft invoices can be approved/);
    });

    it('refuses edits to an approved invoice through the RPC and through the tables', async () => {
        const { error: rpcError } = await rpc(manager, 'save_purchase_invoice_draft', {
            p_supplier_id: supplierId,
            p_warehouse_id: krtId,
            p_invoice_date: today(),
            p_items: [{ product_id: product.id, quantity: 99, unit_cost: 1 }],
            p_id: invoiceA,
        });
        expect(rpcError?.message).toMatch(/Only draft invoices can be edited/);

        const { error: headerError } = await loose(manager).from('purchase_invoices').update({ notes: `${TEST_TAG} edit` }).eq('id', invoiceA);
        expect(headerError).not.toBeNull();
        const { error: itemError } = await loose(admin).from('purchase_invoice_items').update({ quantity: 99 }).eq('invoice_id', invoiceA);
        expect(itemError).not.toBeNull();
    });

    it('refuses an invoice line whose variant does not belong to the product', async () => {
        const { error } = await rpc(manager, 'save_purchase_invoice_draft', {
            p_supplier_id: supplierId,
            p_warehouse_id: krtId,
            p_invoice_date: today(),
            p_items: [{ product_id: product.id, variant_id: 'NO-SUCH-VARIANT', quantity: 1, unit_cost: 1 }],
        });
        expect(error?.message).toMatch(/variant/i);
    });

    it('refuses a supplier invoice reference already used for the same supplier', async () => {
        const { data: existing, error: lookupError } = await loose(admin)
            .from('purchase_invoices')
            .select('supplier_invoice_ref')
            .eq('id', invoiceA)
            .single();
        expect(lookupError).toBeNull();
        const { error } = await rpc(manager, 'save_purchase_invoice_draft', {
            p_supplier_id: supplierId,
            p_warehouse_id: krtId,
            p_invoice_date: today(),
            p_items: [{ product_id: product.id, quantity: 1, unit_cost: 1 }],
            p_supplier_invoice_ref: stringField(existing, 'supplier_invoice_ref'),
        });
        expect(error?.message).toMatch(/already used/);
    });

    it('a supplier return reduces warehouse stock and refuses returning more than was received', async () => {
        const { data: item, error: itemError } = await loose(admin).from('purchase_invoice_items').select('id').eq('invoice_id', invoiceA).single();
        expect(itemError).toBeNull();
        returnedItemId = idOf(item);

        const krtBefore = await readQty(krtId);
        const { data: returnId, error: draftError } = await rpc(manager, 'save_supplier_return_draft', {
            p_supplier_id: supplierId,
            p_warehouse_id: krtId,
            p_reason: 'damaged',
            p_items: [{ purchase_invoice_item_id: returnedItemId, quantity: 3 }],
            p_purchase_invoice_id: invoiceA,
        });
        expect(draftError).toBeNull();
        const { error: approveError } = await rpc(manager, 'approve_supplier_return', { p_return_id: returnId });
        expect(approveError).toBeNull();
        expect(await readQty(krtId)).toBe(krtBefore - 3);

        const { data: excessId, error: excessDraftError } = await rpc(manager, 'save_supplier_return_draft', {
            p_supplier_id: supplierId,
            p_warehouse_id: krtId,
            p_reason: 'excess',
            p_items: [{ purchase_invoice_item_id: returnedItemId, quantity: 8 }],
            p_purchase_invoice_id: invoiceA,
        });
        expect(excessDraftError).toBeNull();
        const { error: excessError } = await rpc(manager, 'approve_supplier_return', { p_return_id: excessId });
        expect(excessError?.message).toMatch(/exceeds the quantity/);
        await rpc(manager, 'cancel_supplier_return', { p_return_id: excessId, p_reason: `${TEST_TAG} over-return` });
    });

    it('only an administrator can void an approved invoice, and voiding reverses its stock', async () => {
        const { error: managerError } = await rpc(manager, 'void_purchase_invoice', { p_invoice_id: invoiceB, p_reason: `${TEST_TAG} manager` });
        expect(managerError?.message).toMatch(/Only administrators/);

        const krtBefore = await readQty(krtId);
        const { error } = await rpc(admin, 'void_purchase_invoice', { p_invoice_id: invoiceB, p_reason: `${TEST_TAG} supplier cancelled` });
        expect(error).toBeNull();
        expect(await readQty(krtId)).toBe(krtBefore - 10);

        const { data: invoice } = await loose(admin).from('purchase_invoices').select('status').eq('id', invoiceB).single();
        expect(invoice?.status).toBe('voided');
    });

    it('a new order writes order_line_costs with the product cost at checkout', async () => {
        const order = await createTestOrder(manager, zone, product.id);
        const { data: lines, error } = await loose(admin)
            .from('order_line_costs')
            .select('line_no,quantity,unit_cost')
            .eq('order_id', order.order_id);
        expect(error).toBeNull();
        expect(lines).toHaveLength(1);
        expect(lines?.[0]).toMatchObject({ line_no: 1, quantity: 1 });
        const current = await getProduct();
        expect(Number(lines?.[0].unit_cost)).toBeCloseTo(Number(current.average_cost), 3);
    });

    it('a logged-in customer cannot read average_cost, and staff product search omits cost fields', async () => {
        const direct = await loose(shopper).from('products').select('average_cost');
        expect(direct.error).not.toBeNull();

        const { data, error } = await rpc(manager, 'staff_search_products', { p_query: null, p_limit: 5 });
        expect(error).toBeNull();
        for (const row of data as unknown as Record<string, unknown>[]) {
            expect(row).not.toHaveProperty('average_cost');
            expect(row).not.toHaveProperty('cost_price');
        }
    });
});
