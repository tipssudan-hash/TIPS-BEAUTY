import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { creds, haveCreds, loose, signedInClient, TEST_TAG, type Client, type LooseRow } from './helpers';

// Saved addresses (customer_addresses): an owner reads, writes and deletes only their own rows. The admin
// account stands in for "another customer" here, since the suite has no second customer login.

const suite = haveCreds ? describe : describe.skip;

const address = (customerId: string, label: string): LooseRow => ({
    customer_id: customerId,
    label,
    recipient_name: TEST_TAG,
    phone: '0999999999',
    state: 'الخرطوم',
    city: 'الخرطوم',
    address_line: 'عنوان اختبار آلي — يرجى الحذف',
    is_default: false,
});

suite('customer addresses are private to their owner', () => {
    let customer: Client;
    let other: Client;
    let customerId: string;
    let otherId: string;
    const created: string[] = [];

    beforeAll(async () => {
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        other = await signedInClient(creds.admin.email, creds.admin.password);
        customerId = (await customer.auth.getUser()).data.user!.id;
        otherId = (await other.auth.getUser()).data.user!.id;

        const { data, error } = await loose(other).from('customer_addresses').insert(address(otherId, `${TEST_TAG} other`)).select('id').single();
        expect(error).toBeNull();
        created.push((data as { id: string }).id);
    });

    afterAll(async () => {
        for (const id of created) {
            await loose(customer).from('customer_addresses').delete().eq('id', id);
            await loose(other).from('customer_addresses').delete().eq('id', id);
        }
    });

    it('an owner creates, reads, updates and deletes their own address', async () => {
        const insert = await loose(customer).from('customer_addresses').insert(address(customerId, `${TEST_TAG} home`)).select('id').single();
        expect(insert.error).toBeNull();
        const id = (insert.data as { id: string }).id;
        created.push(id);

        const read = await loose(customer).from('customer_addresses').select('id,label').eq('id', id);
        expect(read.data).toHaveLength(1);

        const update = await loose(customer).from('customer_addresses').update({ label: `${TEST_TAG} renamed` }).eq('id', id).select('label');
        expect(update.error).toBeNull();
        expect(update.data).toEqual([{ label: `${TEST_TAG} renamed` }]);

        const remove = await loose(customer).from('customer_addresses').delete().eq('id', id).select('id');
        expect(remove.error).toBeNull();
        expect(remove.data).toHaveLength(1);
        created.splice(created.indexOf(id), 1);
    });

    it('a customer does not read another customer\'s addresses', async () => {
        const { data, error } = await loose(customer).from('customer_addresses').select('id').eq('customer_id', otherId);
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
    });

    it('a customer cannot update another customer\'s address', async () => {
        const { data, error } = await loose(customer).from('customer_addresses').update({ label: 'hacked' }).eq('id', created[0]!).select('id');
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
    });

    it('a customer cannot insert an address for another customer', async () => {
        const { error } = await loose(customer).from('customer_addresses').insert(address(otherId, `${TEST_TAG} spoof`));
        expect(error).toBeTruthy();
    });
});
