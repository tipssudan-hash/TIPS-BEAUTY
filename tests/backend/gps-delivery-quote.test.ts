import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { creds, haveCreds, loose, rpc, signedInClient, TEST_TAG, type Client, type LooseRow } from './helpers';

// GPS-02: calculate_delivery_quote. Everything here runs under a throwaway State name no real
// Warehouse/Locality ever uses, so flipping app_settings.dynamic_pricing_states "on" for it can
// never affect a real customer's checkout even though this suite runs against the shared project
// (pre-launch discipline: existing rows are real, not test data).
const TEST_STATE = `${TEST_TAG}-STATE`;

const KRT = { lat: 15.5007, lon: 32.5599 };
const NEAR = { lat: 15.6, lon: 32.6 }; // ~11.85km from KRT by haversine
const FAR = { lat: 19.6158, lon: 37.2164 }; // ~660km from KRT by haversine (Port Sudan-ish)

type Quote = { fee: number; eta_minutes: number | null; source: string };

const suite = haveCreds ? describe : describe.skip;

const idOf = (row: LooseRow | null): string => {
    if (!row || typeof row.id !== 'string') throw new Error('Expected a row with an id');
    return row.id;
};

const stringList = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

suite('calculate_delivery_quote (GPS-02)', () => {
    let admin: Client;
    let warehouseId: string;
    let zoneId: string;
    let originalDynamicStates: string[];

    const from = (table: string) => loose(admin).from(table);

    const quote = async (weight = 0) => {
        const { data, error } = await rpc(admin, 'calculate_delivery_quote', { p_warehouse_id: warehouseId, p_delivery_zone_id: zoneId, p_order_weight: weight });
        if (error) throw error;
        return (data as Quote[])[0];
    };

    beforeAll(async () => {
        admin = await signedInClient(creds.admin.email, creds.admin.password);

        const { data: settings, error: settingsErr } = await from('app_settings').select('dynamic_pricing_states').eq('id', true).single();
        if (settingsErr) throw settingsErr;
        originalDynamicStates = stringList(settings?.dynamic_pricing_states);
        const { error: enableErr } = await from('app_settings').update({ dynamic_pricing_states: [...originalDynamicStates, TEST_STATE] }).eq('id', true);
        if (enableErr) throw enableErr;

        const { data: wh, error: whErr } = await from('warehouses')
            .insert({ name: `${TEST_TAG} warehouse`, code: `${TEST_TAG}-WH`, state: TEST_STATE, city: TEST_STATE, is_active: true, latitude: KRT.lat, longitude: KRT.lon, base_dispatch_minutes: 20 })
            .select('id').single();
        if (whErr) throw whErr;
        warehouseId = idOf(wh);

        const { data: zone, error: zoneErr } = await from('delivery_zones')
            .insert({ name: `${TEST_TAG} zone`, state: TEST_STATE, fee: 999, is_active: true, latitude: NEAR.lat, longitude: NEAR.lon })
            .select('id').single();
        if (zoneErr) throw zoneErr;
        zoneId = idOf(zone);

        const { error: cfgErr } = await from('delivery_pricing_config').insert({
            warehouse_id: warehouseId, delivery_zone_id: zoneId,
            base_fee: 500, per_km_rate: 100, road_multiplier: 1.25, weight_multiplier: 0,
            min_fee: 500, max_fee: 50000, avg_speed_kmh: 30, is_active: true,
        });
        if (cfgErr) throw cfgErr;
    });

    afterAll(async () => {
        if (!admin) return;
        await from('app_settings').update({ dynamic_pricing_states: originalDynamicStates }).eq('id', true);
        if (warehouseId) await from('delivery_pricing_config').delete().eq('warehouse_id', warehouseId);
        if (zoneId) await from('delivery_zones').delete().eq('id', zoneId);
        if (warehouseId) await from('warehouses').delete().eq('id', warehouseId);
    });

    it('computes base + distance x rate x road multiplier for a short in-state leg', async () => {
        const row = await quote();
        expect(row.source).toBe('dynamic');
        // haversine(KRT, NEAR) ~ 11.85km -> 500 + 11.85*100*1.25 ~ 1981; loose bounds for rounding.
        expect(row.fee).toBeGreaterThan(1900);
        expect(row.fee).toBeLessThan(2100);
        expect(row.eta_minutes).toBeGreaterThan(20);
    });

    it('a materially longer leg is clamped to max_fee', async () => {
        const { error: moveErr } = await from('warehouses').update({ latitude: FAR.lat, longitude: FAR.lon }).eq('id', warehouseId);
        if (moveErr) throw moveErr;
        const row = await quote();
        await from('warehouses').update({ latitude: KRT.lat, longitude: KRT.lon }).eq('id', warehouseId);
        expect(row.source).toBe('dynamic');
        expect(row.fee).toBe(50000);
    });

    it('clamps to min_fee when the raw formula would come in below it', async () => {
        const { error: raiseErr } = await from('delivery_pricing_config').update({ min_fee: 5000 }).eq('warehouse_id', warehouseId).eq('delivery_zone_id', zoneId);
        if (raiseErr) throw raiseErr;
        const row = await quote();
        await from('delivery_pricing_config').update({ min_fee: 500 }).eq('warehouse_id', warehouseId).eq('delivery_zone_id', zoneId);
        expect(row.fee).toBe(5000);
    });

    it('falls back to the flat zone fee when no config row matches', async () => {
        const { error: delErr } = await from('delivery_pricing_config').delete().eq('warehouse_id', warehouseId).eq('delivery_zone_id', zoneId);
        if (delErr) throw delErr;
        const row = await quote();
        expect(row.source).toBe('flat_fee_missing_config');
        expect(row.fee).toBe(999);
        const { error: restoreErr } = await from('delivery_pricing_config').insert({
            warehouse_id: warehouseId, delivery_zone_id: zoneId,
            base_fee: 500, per_km_rate: 100, road_multiplier: 1.25, weight_multiplier: 0,
            min_fee: 500, max_fee: 50000, avg_speed_kmh: 30, is_active: true,
        });
        if (restoreErr) throw restoreErr;
    });

    it("falls back to the flat zone fee when the zone's state is not in dynamic_pricing_states", async () => {
        const { error: disableErr } = await from('app_settings').update({ dynamic_pricing_states: originalDynamicStates }).eq('id', true);
        if (disableErr) throw disableErr;
        const row = await quote();
        await from('app_settings').update({ dynamic_pricing_states: [...originalDynamicStates, TEST_STATE] }).eq('id', true);
        expect(row.source).toBe('flat_fee');
        expect(row.fee).toBe(999);
    });

    it('rejects a second (warehouse, state) default row — partial unique index holds under concurrent writes', async () => {
        const stateDefaultRow = { warehouse_id: warehouseId, state: TEST_STATE, base_fee: 100, per_km_rate: 10, road_multiplier: 1, min_fee: 100, is_active: true };
        const [first, second] = await Promise.all([
            from('delivery_pricing_config').insert(stateDefaultRow),
            from('delivery_pricing_config').insert(stateDefaultRow),
        ]);
        const errors = [first.error, second.error].filter((e): e is NonNullable<typeof e> => e !== null);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.message).toMatch(/duplicate key|unique/i);
        await from('delivery_pricing_config').delete().eq('warehouse_id', warehouseId).is('delivery_zone_id', null).eq('state', TEST_STATE);
    });
});
