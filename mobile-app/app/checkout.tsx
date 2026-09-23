import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useTipsStore } from "@/lib/tips-store";
import {
  createOrder,
  fetchDeliveryZones,
  fetchPaymentMethods,
  getDeliveryFee,
} from "@/lib/tips-api";

type Method = {
  code: string;
  name_ar: string;
  description_ar: string | null;
  requires_proof: boolean;
};

export default function CheckoutScreen() {
  const { session, cart, clearCart, preferences } = useTipsStore();
  const [name, setName] = useState(preferences?.fullName || "");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState(preferences?.city || "الخرطوم");
  const [coupon, setCoupon] = useState("");
  const [points, setPoints] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [affiliateCode, setAffiliateCode] = useState("");
  const [zones, setZones] = useState<
    Array<{ name: string; state?: string | null; fee: number }>
  >([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [method, setMethod] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const checkoutKey = useRef<string | null>(null);

  useEffect(() => {
    if (preferences?.fullName && !name) setName(preferences.fullName);
    if (preferences?.city) setCity(preferences.city);
  }, [preferences]);

  useEffect(() => {
    void Promise.all([fetchPaymentMethods(), fetchDeliveryZones()])
      .then(([items, nextZones]) => {
        setMethods(items);
        setMethod(items[0]?.code || "COD");
        setZones(nextZones);
      })
      .catch((e: any) => setError(e?.message || "تعذر جلب طرق الدفع."));
  }, []);

  const shippingFee = getDeliveryFee(zones, city);
  const subtotal = cart.reduce(
    (sum, item) =>
      sum +
      Number(item.price) *
        (1 - Number(item.discount_percentage || 0) / 100) *
        item.quantity,
    0
  );

  const submit = async () => {
    if (!session) {
      router.replace("/auth");
      return;
    }
    if (!name.trim() || !phone.trim() || !address.trim() || !method) {
      setError("أكملي بيانات التوصيل وطريقة الدفع.");
      return;
    }
    checkoutKey.current ||= `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    setLoading(true);
    setError("");
    try {
      const result = await createOrder(session, {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city,
        paymentMethod: method,
        items: cart,
        couponCode: coupon.trim(),
        pointsToRedeem: Number(points || 0),
        referralCode: referralCode.trim(),
        affiliateCode: affiliateCode.trim(),
        idempotencyKey: checkoutKey.current,
      });
      const created = Array.isArray(result) ? result[0] : result;
      await clearCart();
      checkoutKey.current = null;
      const needsProof = Boolean(
        methods.find((item) => item.code === method)?.requires_proof
      );
      Alert.alert(
        "تم إنشاء الطلب بنجاح",
        `رقم طلبك: ${created?.order_number || "TB-" + Date.now().toString().slice(-6)}. ${
          needsProof
            ? "يمكنك رفع إثبات الدفع الآن."
            : "تابعي حالة الطلب من تبويب طلباتي."
        }`,
        [
          {
            text: needsProof ? "رفع الإثبات" : "متابعة",
            onPress: () =>
              router.replace(
                needsProof
                  ? (`/payment-proof?order=${created?.order_id || ""}` as never)
                  : "/orders"
              ),
          },
        ]
      );
    } catch (e: any) {
      setError(e.message || "تعذر إنشاء الطلب.");
    } finally {
      setLoading(false);
    }
  };

  if (!cart.length) {
    router.replace("/cart");
    return null;
  }

  return (
    <ScreenContainer
      edges={["top", "bottom", "left", "right"]}
      containerClassName="bg-[#fff7fa]"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MaterialIcons name="close" size={24} color="white" />
        </Pressable>
        <Text style={styles.title}>إتمام الطلب</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.section}>بيانات التوصيل</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="الاسم بالكامل"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          textAlign="right"
        />
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="رقم الهاتف (مثال: 0912345678)"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          keyboardType="phone-pad"
          textAlign="right"
        />

        {zones.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.zoneList}
          >
            {zones.map((zone) => (
              <Pressable
                key={zone.name}
                onPress={() => setCity(zone.name)}
                style={[
                  styles.zone,
                  city === zone.name && styles.zoneActive,
                ]}
              >
                <Text
                  style={[
                    styles.zoneName,
                    city === zone.name && styles.zoneNameActive,
                  ]}
                >
                  {zone.name}
                </Text>
                <Text
                  style={[
                    styles.zoneFee,
                    city === zone.name && styles.zoneNameActive,
                  ]}
                >
                  {Number(zone.fee).toLocaleString()} ج.س
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="المدينة"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            textAlign="right"
          />
        )}

        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="العنوان بالتفصيل (الحي، الشارع، المعلم المميز)"
          placeholderTextColor="#94a3b8"
          style={[styles.input, styles.address]}
          multiline
          textAlign="right"
        />

        <Text style={styles.section}>طريقة الدفع</Text>
        {methods.map((item) => (
          <Pressable
            key={item.code}
            onPress={() => setMethod(item.code)}
            style={[
              styles.method,
              method === item.code && styles.methodActive,
            ]}
          >
            <View style={styles.methodText}>
              <Text style={styles.methodName}>{item.name_ar}</Text>
              <Text style={styles.methodDesc}>{item.description_ar || ""}</Text>
            </View>
            <MaterialIcons
              name={
                method === item.code
                  ? "radio-button-checked"
                  : "radio-button-unchecked"
              }
              size={22}
              color="#be185d"
            />
          </Pressable>
        ))}

        <Text style={styles.section}>كوبون الخصم ونقاط الجمال</Text>
        <TextInput
          value={coupon}
          onChangeText={setCoupon}
          placeholder="كود الخصم (اختياري)"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          autoCapitalize="characters"
          textAlign="right"
        />
        <TextInput
          value={points}
          onChangeText={setPoints}
          placeholder="نقاط الجمال للاستبدال (اختياري)"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          keyboardType="numeric"
          textAlign="right"
        />

        <Text style={styles.section}>كود إحالة أو مسوقة</Text>
        <TextInput
          value={referralCode}
          onChangeText={setReferralCode}
          placeholder="كود إحالة صديقة (اختياري)"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          autoCapitalize="characters"
          textAlign="right"
        />
        <TextInput
          value={affiliateCode}
          onChangeText={setAffiliateCode}
          placeholder="كود المسوقة (اختياري)"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          autoCapitalize="characters"
          textAlign="right"
        />

        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>الإجمالي النهائي</Text>
          <Text style={styles.summaryTotal}>
            {(subtotal + shippingFee).toLocaleString()} ج.س
          </Text>
          <Text style={styles.note}>
            رسوم توصيل {city}: {shippingFee.toLocaleString()} ج.س.
          </Text>
        </View>

        <Pressable
          onPress={() => void submit()}
          disabled={loading}
          style={({ pressed }) => [
            styles.confirm,
            loading && { opacity: 0.65 },
            pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.confirmText}>تأكيد وإتمام الطلب</Text>
          )}
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#1e1b4b",
    padding: 18,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    maxWidth: 580,
    alignSelf: "center",
  },
  title: {
    color: "white",
    fontSize: 20,
    fontWeight: "900",
  },
  body: {
    padding: 18,
    paddingBottom: 40,
    width: "100%",
    maxWidth: 580,
    alignSelf: "center",
  },
  section: {
    color: "#1e1b4b",
    fontWeight: "900",
    fontSize: 14,
    marginTop: 16,
    marginBottom: 8,
    textAlign: "right",
  },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#ffe4e6",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    color: "#1e1b4b",
  },
  address: {
    height: 78,
    textAlignVertical: "top",
  },
  zoneList: {
    gap: 8,
    paddingBottom: 10,
    flexDirection: "row-reverse",
  },
  zone: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ffe4e6",
    minWidth: 105,
  },
  zoneActive: {
    backgroundColor: "#be185d",
    borderColor: "#be185d",
  },
  zoneName: {
    color: "#1e1b4b",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  zoneFee: {
    color: "#64748b",
    fontSize: 10,
    marginTop: 3,
    textAlign: "center",
  },
  zoneNameActive: {
    color: "#fff",
  },
  method: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#ffe4e6",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  methodActive: {
    borderColor: "#be185d",
    backgroundColor: "#fff1f2",
  },
  methodText: {
    flex: 1,
  },
  methodName: {
    fontWeight: "800",
    color: "#1e1b4b",
    textAlign: "right",
  },
  methodDesc: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 3,
    textAlign: "right",
  },
  summary: {
    backgroundColor: "#1e1b4b",
    borderRadius: 18,
    padding: 18,
    marginTop: 18,
  },
  summaryLabel: {
    color: "#fce7f3",
    textAlign: "right",
    fontSize: 12,
  },
  summaryTotal: {
    color: "white",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "right",
    marginTop: 6,
  },
  note: {
    color: "#fbcfe8",
    fontSize: 11,
    textAlign: "right",
    marginTop: 8,
  },
  confirm: {
    backgroundColor: "#be185d",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 16,
    shadowColor: "#be185d",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  confirmText: {
    color: "white",
    fontSize: 15,
    fontWeight: "900",
  },
  error: {
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    borderRadius: 12,
    padding: 12,
    textAlign: "right",
    marginBottom: 10,
  },
});
