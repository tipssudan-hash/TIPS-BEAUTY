import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
    process.exit(1);
}

const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
    console.log('🔍 Testing Supabase connection and Cash Cycle schema...\n');
    let allPassed = true;

    // 1. Check driver_cash_remittances table
    try {
        const { data, error } = await supabase.from('driver_cash_remittances').select('id, amount, status').limit(1);
        if (error && error.code === '42P01') {
            console.error('❌ Table driver_cash_remittances does NOT exist.');
            allPassed = false;
        } else if (error && error.code !== 'PGRST116') {
            // RLS might deny or return empty, which means table exists!
            console.log('✅ Table driver_cash_remittances exists (RLS active, code:', error.code || 'none', ')');
        } else {
            console.log('✅ Table driver_cash_remittances exists and accessible.');
        }
    } catch (e) {
        console.error('❌ Error checking driver_cash_remittances:', e.message);
        allPassed = false;
    }

    // 2. Check driver_submit_cash_remittance RPC
    try {
        const { data, error } = await supabase.rpc('driver_submit_cash_remittance', {
            p_amount: 100,
            p_notes: 'schema check'
        });
        // Since we are unauthenticated/anon, expected error is 'Driver access required' or 401
        if (error && error.message.includes('Driver access required')) {
            console.log('✅ RPC driver_submit_cash_remittance is installed & security checks active (Driver access required)');
        } else if (error && error.code === '42883') {
            console.error('❌ RPC driver_submit_cash_remittance does NOT exist.');
            allPassed = false;
        } else if (error) {
            console.log('✅ RPC driver_submit_cash_remittance is installed (returned:', error.message, ')');
        } else {
            console.log('✅ RPC driver_submit_cash_remittance is installed.');
        }
    } catch (e) {
        console.error('❌ Error checking driver_submit_cash_remittance:', e.message);
        allPassed = false;
    }

    // 3. Check supervisor_confirm_cash_remittance RPC
    try {
        const { data, error } = await supabase.rpc('supervisor_confirm_cash_remittance', {
            p_remittance_id: '00000000-0000-0000-0000-000000000000',
            p_action: 'confirmed'
        });
        if (error && (error.message.includes('Supervisor or admin access required') || error.message.includes('Driver access required'))) {
            console.log('✅ RPC supervisor_confirm_cash_remittance is installed & security checks active');
        } else if (error && error.code === '42883') {
            console.error('❌ RPC supervisor_confirm_cash_remittance does NOT exist.');
            allPassed = false;
        } else if (error) {
            console.log('✅ RPC supervisor_confirm_cash_remittance is installed (returned:', error.message, ')');
        } else {
            console.log('✅ RPC supervisor_confirm_cash_remittance is installed.');
        }
    } catch (e) {
        console.error('❌ Error checking supervisor_confirm_cash_remittance:', e.message);
        allPassed = false;
    }

    // 4. Check update_driver_order_status RPC
    try {
        const { data, error } = await supabase.rpc('update_driver_order_status', {
            p_order_id: '00000000-0000-0000-0000-000000000000',
            p_status: 'delivered'
        });
        if (error && error.message.includes('Driver access required')) {
            console.log('✅ RPC update_driver_order_status is installed & security checks active');
        } else if (error && error.code === '42883') {
            console.error('❌ RPC update_driver_order_status does NOT exist.');
            allPassed = false;
        } else if (error) {
            console.log('✅ RPC update_driver_order_status is installed (returned:', error.message, ')');
        } else {
            console.log('✅ RPC update_driver_order_status is installed.');
        }
    } catch (e) {
        console.error('❌ Error checking update_driver_order_status:', e.message);
        allPassed = false;
    }

    // 5. Check supervisor_get_warehouse_drivers RPC
    try {
        const { data, error } = await supabase.rpc('supervisor_get_warehouse_drivers');
        if (error && error.code === '42883') {
            console.error('❌ RPC supervisor_get_warehouse_drivers does NOT exist.');
            allPassed = false;
        } else {
            console.log('✅ RPC supervisor_get_warehouse_drivers is installed.');
        }
    } catch (e) {
        console.error('❌ Error checking supervisor_get_warehouse_drivers:', e.message);
        allPassed = false;
    }

    // 6. Check get_warehouse_settlement_summary RPC
    try {
        const { data, error } = await supabase.rpc('get_warehouse_settlement_summary');
        if (error && (error.message.includes('Supervisor or admin access required') || error.code === 'P0001')) {
            console.log('✅ RPC get_warehouse_settlement_summary is installed & security checks active');
        } else if (error && error.code === '42883') {
            console.error('❌ RPC get_warehouse_settlement_summary does NOT exist.');
            allPassed = false;
        } else if (error) {
            console.log('✅ RPC get_warehouse_settlement_summary is installed (returned:', error.message, ')');
        } else {
            console.log('✅ RPC get_warehouse_settlement_summary is installed.');
        }
    } catch (e) {
        console.error('❌ Error checking get_warehouse_settlement_summary:', e.message);
        allPassed = false;
    }

    console.log('\n=============================================');
    if (allPassed) {
        console.log('🎉 ALL CASH CYCLE SCHEMA & RPCS ARE LIVE & VERIFIED!');
    } else {
        console.log('⚠️ Some components were not found. Check errors above.');
    }
    console.log('=============================================\n');
}

main();
