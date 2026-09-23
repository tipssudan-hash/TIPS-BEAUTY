import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { ScreenContainer } from "@/components/screen-container";
import { deleteReviewImage, submitPurchasedReview, uploadReviewImage } from "@/lib/tips-api";
import { useTipsStore } from "@/lib/tips-store";

type LocalPhoto = { uri: string; mimeType?: string | null };

export default function ReviewPurchaseScreen() {
  const { orderId, productId } = useLocalSearchParams<{ orderId: string; productId: string }>();
  const { products, session } = useTipsStore();
  const product = useMemo(() => products.find((item) => item.id === productId), [products, productId]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void ImagePicker.getPendingResultAsync().then((result) => {
      if (result && "canceled" in result && !result.canceled && "assets" in result && result.assets?.length) {
        setPhotos(result.assets.slice(0, 3).map((asset: ImagePicker.ImagePickerAsset) => ({ uri: asset.uri, mimeType: asset.mimeType })));
      }
    });
  }, []);

  if (!session || !orderId || !productId || !product) {
    return <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#f7f8fc]"><View style={styles.empty}><MaterialIcons name="rate-review" size={48} color="#94a3b8" /><Text style={styles.emptyTitle}>لا يمكن فتح نموذج التقييم</Text><Text style={styles.emptyText}>يجب أن يكون المنتج ضمن طلب مكتمل تم توصيله.</Text><Pressable onPress={() => router.replace("/orders" as never)} style={styles.primary}><Text style={styles.primaryText}>العودة إلى طلباتي</Text></Pressable></View></ScreenContainer>;
  }

  const chooseFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 3 - photos.length),
      quality: 0.72,
    });
    if (!result.canceled) setPhotos((current) => [...current, ...result.assets.map((asset) => ({ uri: asset.uri, mimeType: asset.mimeType }))].slice(0, 3));
  };
  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { Alert.alert("صلاحية الكاميرا", "يلزم السماح بالكاميرا لإضافة صورة من منتجك."); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.72 });
    if (!result.canceled) setPhotos((current) => [...current, { uri: result.assets[0].uri, mimeType: result.assets[0].mimeType }].slice(0, 3));
  };
  const removePhoto = (index: number) => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
  const submit = async () => {
    if (!rating) { Alert.alert("اختاري التقييم", "حددي من نجمة إلى خمس نجوم لتقييم المنتج."); return; }
    setSubmitting(true);
    const uploadedPaths: string[] = [];
    try {
      for (const photo of photos) uploadedPaths.push(await uploadReviewImage(session, productId, photo.uri, photo.mimeType || "image/jpeg"));
      await submitPurchasedReview(session, { orderId, productId, rating, comment: comment.trim(), imagePaths: uploadedPaths });
      Alert.alert("شكراً لرأيك", "تم نشر تقييمك كمراجعة من عميلة اشترت المنتج بالفعل.", [{ text: "تم", onPress: () => router.replace("/orders" as never) }]);
    } catch (error: any) {
      await Promise.all(uploadedPaths.map((path) => deleteReviewImage(session, path).catch(() => undefined)));
      Alert.alert("تعذر إرسال التقييم", error.message || "حاولي مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#f7f8fc]"><View style={styles.screen}><View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={styles.back}><MaterialIcons name="arrow-forward" size={23} color="#16213e" /></Pressable><Text style={styles.headerTitle}>تقييم منتجك</Text><View style={styles.headerIcon}><MaterialIcons name="verified" size={20} color="#17835e" /></View></View><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.product}><Image source={{ uri: product.image || undefined }} style={styles.productImage} /><View style={styles.productInfo}><Text style={styles.productName}>{product.name_ar}</Text><Text style={styles.productBrand}>{product.brand || "TIPS Beauty"}</Text><Text style={styles.verified}><MaterialIcons name="verified-user" size={14} color="#17835e" /> مشتريات موثقة</Text></View></View><Text style={styles.label}>كيف كان المنتج؟</Text><View style={styles.stars}>{[1, 2, 3, 4, 5].map((star) => <Pressable accessibilityRole="button" accessibilityLabel={`${star} نجوم`} key={star} onPress={() => setRating(star)} style={({ pressed }) => [styles.starButton, pressed && styles.pressed]}><MaterialIcons name={star <= rating ? "star" : "star-border"} size={42} color="#f59e0b" /></Pressable>)}</View><Text style={styles.ratingHint}>{rating ? `${rating} من 5` : "اختاري عدد النجوم"}</Text><Text style={styles.label}>اكتبي رأيك <Text style={styles.optional}>(اختياري)</Text></Text><TextInput value={comment} onChangeText={setComment} maxLength={1000} multiline textAlign="right" placeholder="كيف كانت تجربتك مع المنتج؟" placeholderTextColor="#94a3b8" style={styles.comment} /><Text style={styles.counter}>{comment.length}/1000</Text><Text style={styles.label}>صور تجربتك <Text style={styles.optional}>(حتى 3 صور)</Text></Text><Text style={styles.photoHint}>يمكنك إضافة صور حقيقية للمنتج الذي استلمته. ستظهر مع تقييمك.</Text>{photos.length ? <View style={styles.photoList}>{photos.map((photo, index) => <View key={`${photo.uri}-${index}`} style={styles.photoWrap}><Image source={{ uri: photo.uri }} style={styles.photo} /><Pressable accessibilityRole="button" accessibilityLabel="حذف الصورة" onPress={() => removePhoto(index)} style={styles.photoRemove}><MaterialIcons name="close" size={17} color="#fff" /></Pressable></View>)}</View> : null}{photos.length < 3 ? <View style={styles.photoActions}><Pressable accessibilityRole="button" onPress={() => void chooseFromLibrary()} style={({ pressed }) => [styles.photoAction, pressed && styles.pressed]}><MaterialIcons name="photo-library" size={21} color="#1e5fa8" /><Text style={styles.photoActionText}>اختيار صورة</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void takePhoto()} style={({ pressed }) => [styles.photoAction, pressed && styles.pressed]}><MaterialIcons name="photo-camera" size={21} color="#1e5fa8" /><Text style={styles.photoActionText}>التقاط صورة</Text></Pressable></View> : null}<Pressable accessibilityRole="button" disabled={submitting} onPress={() => void submit()} style={({ pressed }) => [styles.submit, (pressed || submitting) && styles.pressed]}>{submitting ? <ActivityIndicator color="#fff" /> : <><MaterialIcons name="send" size={20} color="#fff" /><Text style={styles.submitText}>نشر التقييم</Text></>}</Pressable><Text style={styles.note}>يمكن فقط لصاحبة طلب تم توصيله نشر تقييم واحد لكل منتج في الطلب.</Text></ScrollView></View></ScreenContainer>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { minHeight: 66, backgroundColor: "#fff", paddingHorizontal: 16, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#eaf0f7" }, headerTitle: { color: "#16213e", fontSize: 18, fontWeight: "900" }, back: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#edf5fd", alignItems: "center", justifyContent: "center" }, headerIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#ecfdf5", alignItems: "center", justifyContent: "center" }, content: { padding: 16, paddingBottom: 34 }, product: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#eaf0f7", borderRadius: 18, padding: 11, flexDirection: "row-reverse", gap: 12, alignItems: "center" }, productImage: { width: 78, height: 78, borderRadius: 13, backgroundColor: "#edf5fd" }, productInfo: { flex: 1, alignItems: "flex-end" }, productName: { color: "#16213e", fontSize: 14, fontWeight: "900", textAlign: "right" }, productBrand: { color: "#94a3b8", fontSize: 11, marginTop: 4 }, verified: { color: "#17835e", fontWeight: "800", fontSize: 11, marginTop: 8 }, label: { color: "#16213e", fontSize: 14, fontWeight: "900", textAlign: "right", marginTop: 22 }, optional: { color: "#94a3b8", fontSize: 11 }, stars: { flexDirection: "row", justifyContent: "center", gap: 4, marginTop: 10 }, starButton: { padding: 2 }, ratingHint: { color: "#718096", textAlign: "center", fontSize: 12, marginTop: 4 }, comment: { minHeight: 118, marginTop: 9, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce9f6", padding: 13, color: "#16213e", textAlignVertical: "top", fontSize: 14, lineHeight: 21 }, counter: { color: "#94a3b8", textAlign: "left", fontSize: 10, marginTop: 4 }, photoHint: { color: "#718096", fontSize: 11, textAlign: "right", lineHeight: 18, marginTop: 6 }, photoList: { flexDirection: "row-reverse", gap: 10, marginTop: 12 }, photoWrap: { position: "relative" }, photo: { width: 92, height: 92, borderRadius: 14, backgroundColor: "#edf5fd" }, photoRemove: { position: "absolute", top: -6, left: -6, width: 25, height: 25, borderRadius: 13, backgroundColor: "#dc426d", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" }, photoActions: { flexDirection: "row-reverse", gap: 10, marginTop: 12 }, photoAction: { flex: 1, height: 48, borderWidth: 1, borderColor: "#bdd5ee", borderRadius: 14, backgroundColor: "#fff", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 7 }, photoActionText: { color: "#1e5fa8", fontSize: 12, fontWeight: "900" }, submit: { height: 54, backgroundColor: "#1e5fa8", borderRadius: 15, marginTop: 24, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 }, submitText: { color: "#fff", fontSize: 15, fontWeight: "900" }, note: { color: "#94a3b8", fontSize: 10, textAlign: "center", lineHeight: 16, marginTop: 12, paddingHorizontal: 20 }, pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] }, empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 }, emptyTitle: { color: "#16213e", fontWeight: "900", fontSize: 20 }, emptyText: { color: "#64748b", fontSize: 12, textAlign: "center" }, primary: { backgroundColor: "#1e5fa8", borderRadius: 13, paddingHorizontal: 20, paddingVertical: 12, marginTop: 6 }, primaryText: { color: "#fff", fontWeight: "900" },
});
