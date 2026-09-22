import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_TAG, creds, haveCreds, rpc, signedInClient, type Client } from './helpers';

// Driver account linking (launch step 6): staff link a drivers row to a login through one RPC that
// also makes the account a Driver; unlinking reverses both. The test links the customer test account
// to a throw-away driver row and always unlinks it again.

const suite = haveCreds ? describe : describe.skip;

type AdminDriver = { id: string; name: string; user_id: string | null; user_email: string | null; status: string };

suite('driver linking over the admin RPCs', () => {
    let admin: Client;
    let customer: Client;
    let driverId: string;

    const drivers = async () => {
        const { data, error } = await rpc(admin, 'admin_get_drivers');
        if (error) throw error;
        return data as unknown as AdminDriver[];
    };
    const role = async () => {
        const { data, error } = await customer.rpc('is_driver');
        if (error) throw error;
        return data as unknown as boolean;
    };

    beforeAll(async () => {
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        await admin.from('drivers').delete().like('name', `${TEST_TAG}%`);
        const { data, error } = await admin.from('drivers').insert({ name: `${TEST_TAG} driver`, phone: '0911111111', status: 'active' }).select('id').single();
        if (error) throw error;
        driverId = data.id;
    });

    afterAll(async () => {
        if (!admin || !driverId) return;
        await rpc(admin, 'admin_unlink_driver_user', { p_driver_id: driverId });
        await admin.from('drivers').delete().eq('id', driverId);
    });

    it('refuses non-admins, unknown emails and admin accounts', async () => {
        expect((await rpc(customer, 'admin_link_driver_user', { p_driver_id: driverId, p_email: creds.customer.email })).error?.message).toMatch(/Administrator/);
        expect((await rpc(admin, 'admin_link_driver_user', { p_driver_id: driverId, p_email: 'nobody@example.invalid' })).error?.message).toMatch(/sign up/);
        expect((await rpc(admin, 'admin_link_driver_user', { p_driver_id: driverId, p_email: creds.admin.email })).error?.message).toMatch(/administrator/i);
        expect((await drivers()).find((d) => d.id === driverId)?.user_id).toBeNull();
    });

    it('links a login (case-insensitively), makes it a Driver, and unlinking restores a customer', async () => {
        expect(await role()).toBe(false);
        const { data, error } = await rpc(admin, 'admin_link_driver_user', { p_driver_id: driverId, p_email: creds.customer.email.toUpperCase() });
        expect(error).toBeNull();
        expect(typeof data).toBe('string');
        try {
            const row = (await drivers()).find((d) => d.id === driverId)!;
            expect(row.user_email?.toLowerCase()).toBe(creds.customer.email.toLowerCase());
            expect(await role()).toBe(true);

            // The same login cannot be linked to a second driver.
            const { data: other } = await admin.from('drivers').insert({ name: `${TEST_TAG} driver 2`, phone: '0922222222', status: 'active' }).select('id').single();
            const twice = await rpc(admin, 'admin_link_driver_user', { p_driver_id: other!.id, p_email: creds.customer.email });
            expect(twice.error?.message).toMatch(/already linked/);
            await admin.from('drivers').delete().eq('id', other!.id);
        } finally {
            const { error: unlinkError } = await rpc(admin, 'admin_unlink_driver_user', { p_driver_id: driverId });
            expect(unlinkError).toBeNull();
        }
        const after = (await drivers()).find((d) => d.id === driverId)!;
        expect(after.user_id).toBeNull();
        expect(after.status).toBe('offline');
        expect(await role()).toBe(false);
    });
});
