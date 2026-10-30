import { supabase } from '../supabase/client';
import type { CustomerAddress } from '../../domain/entities';

export interface NewCustomerAddress {
    label: string;
    recipientName: string;
    phone: string;
    state: string;
    city: string;
    addressLine: string;
    latitude: number | null;
    longitude: number | null;
}

type AddressRow = {
    id: string; label: string; recipient_name: string; phone: string; state: string; city: string; address_line: string;
    latitude: number | null; longitude: number | null; is_default: boolean;
};

const ADDRESS_COLUMNS = 'id,label,recipient_name,phone,state,city,address_line,latitude,longitude,is_default';

function mapAddress(row: AddressRow): CustomerAddress {
    return {
        id: row.id,
        label: row.label,
        recipientName: row.recipient_name,
        phone: row.phone,
        state: row.state,
        city: row.city,
        addressLine: row.address_line,
        latitude: row.latitude == null ? null : Number(row.latitude),
        longitude: row.longitude == null ? null : Number(row.longitude),
        isDefault: row.is_default,
    };
}

// Row-level security limits both reads and writes to the signed-in customer's own rows.
export async function fetchMyAddresses(): Promise<CustomerAddress[]> {
    const { data, error } = await supabase
        .from('customer_addresses')
        .select(ADDRESS_COLUMNS)
        .order('is_default', { ascending: false })
        .order('created_at');
    if (error) throw error;
    return ((data ?? []) as AddressRow[]).map(mapAddress);
}

// The first address a customer saves becomes the default; later ones are saved as plain addresses.
export async function saveMyAddress(userId: string, input: NewCustomerAddress, isFirst: boolean): Promise<CustomerAddress> {
    const { data, error } = await supabase
        .from('customer_addresses')
        .insert({
            customer_id: userId,
            label: input.label.trim(),
            recipient_name: input.recipientName.trim(),
            phone: input.phone.trim(),
            state: input.state,
            city: input.city,
            address_line: input.addressLine.trim(),
            latitude: input.latitude,
            longitude: input.longitude,
            is_default: isFirst,
        })
        .select(ADDRESS_COLUMNS)
        .single();
    if (error) throw error;
    return mapAddress(data as AddressRow);
}
