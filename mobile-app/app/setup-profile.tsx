import { useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { saveCustomerPreferences } from "@/lib/tips-api";

const AVATARS = [
  { id: "1", source: require("../assets/images/hero-makeup-model.jpg") },
  { id: "2", source: require("../assets/images/hero-skincare-glow.png") },
  { id: "3", source: require("../assets/images/hero-elegance-model.png") },
];

const CITIES = [
  "الخرطوم",
  "بحري",
  "أم درمان",
  "بورتسودان",
  "مدني",
  "كسلا",
  "عطبرة",
  "القضارف",
  "أخرى",
];

const AGE_GROUPS = ["18 - 24", "25 - 34", "35 - 44", "45+"];

const SKIN_TYPES = [
  { label: "دهنية", desc: "Oily Skin" },
  { label: "جافة", desc: "Dry Skin" },
  { label: "مختلطة", desc: "Combination" },
  { label: "عادية", desc: "Normal Skin" },
  { label: "حساسة", desc: "Sensitive" },
];

const HAIR_TYPES = [
  { label: "ناعم", desc: "Straight" },
  { label: "مموج", desc: "Wavy" },
  { label: "كيرلي", desc: "Curly / Coily" },
  { label: "مصبوغ / معالج", desc: "Treated" },
];

const CONCERNS = [
  "نضارة وتفتيح",
  "ترطيب عميق",
  "علاج حب الشباب",
  "مقاومة التجاعيد",
  "توحيد لون البشرة",
  "العناية بالمسام",
];

const CATEGORIES = [
  "العناية بالبشرة",
  "المكياج",
  "العطور",
  "العناية بالشعر",
  "أدوات التجميل",
];

export default function SetupProfileScreen() {
  const { session, preferences, setPreferences } = useTipsStore();
  const [fullName, setFullName] = useState(preferences?.fullName || "");
  const [selectedAvatar, setSelectedAvatar] = useState(0);
  const [selectedCity, setSelectedCity] = useState(preferences?.city || "الخرطوم");
  const [selectedAge, setSelectedAge] = useState(preferences?.ageGroup || "25 - 34");
  const [selectedSkin, setSelectedSkin] = useState(preferences?.skinType || "مختلطة");
  const [selectedHair, setSelectedHair] = useState(preferences?.hairType || "ناعم");
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>(
    preferences?.concerns?.length
      ? preferences.concerns
      : ["نضارة وتفتيح", "ترطيب عميق"]
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    preferences?.preferredCategories?.length
      ? preferences.preferredCategories
      : ["العناية بالبشرة", "المكياج"]
  );
  const [saving, setSaving] = useState(false);

  const toggleConcern = (item: string) => {
    if (selectedConcerns.includes(item)) {
      setSelectedConcerns(selectedConcerns.filter((c) => c !== item));
    } else {
      setSelectedConcerns([...selectedConcerns, item]);
    }
  };

  const toggleCategory = (item: string) => {
    if (selectedCategories.includes(item)) {
      setSelectedCategories(selectedCategories.filter((c) => c !== item));
    } else {
      setSelectedCategories([...selectedCategories, item]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const prefsData = {
      fullName: fullName.trim() || preferences?.fullName || "عميلة تيبس",
      avatarUrl: `avatar_${selectedAvatar}`,
      city: selectedCity,
      ageGroup: selectedAge,
      skinType: selectedSkin,
      hairType: selectedHair,
      concerns: selectedConcerns,
      preferredCategories: selectedCategories,
    };
    try {
      await setPreferences(prefsData);
    } finally {
      setSaving(false);
      router.replace("/(tabs)" as never);
    }
  };

  const handleSkip = () => {
    router.replace("/(tabs)" as never);
  };

  return (
    <ScreenContainer
      edges={["top", "bottom", "left", "right"]}
      containerClassName="bg-[#fff7fa]"
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Actions */}
        <View style={styles.topBar}>
          <Pressable onPress={handleSkip} style={styles.skipBtn}>
            <Text style={styles.skipText}>تخطي الآن</Text>
            <MaterialIcons name="chevron-left" size={20} color="#64748b" />
          </Pressable>
          <View style={styles.stepBadge}>
            <Text style={styles.stepText}>إعداد ملف الجمال</Text>
          </View>
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>خصصي تجربتك في تيبس ✨</Text>
          <Text style={styles.subtitle}>
            ساعدينا في التعرف على اهتماماتك لنقدم لكِ ترشيحات مخصصة لجمالك وعنايتك.
          </Text>
        </View>

        {/* Avatar Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>صورة الملف الشخصي</Text>
          <View style={styles.avatarMainWrap}>
            <Image source={AVATARS[selectedAvatar].source} style={styles.avatarMain} />
            <View style={styles.avatarBadge}>
              <MaterialIcons name="auto-awesome" size={16} color="white" />
            </View>
          </View>
          <View style={styles.avatarRow}>
            {AVATARS.map((item, idx) => (
              <Pressable
                key={item.id}
                onPress={() => setSelectedAvatar(idx)}
                style={[
                  styles.avatarOption,
                  selectedAvatar === idx && styles.avatarOptionSelected,
                ]}
              >
                <Image source={item.source} style={styles.avatarOptionImg} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* Full Name */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الاسم بالكامل</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="person-outline" size={20} color="#94a3b8" />
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="مثال: سارة محمد"
              placeholderTextColor="#94a3b8"
              style={styles.textInput}
              textAlign="right"
            />
          </View>
        </View>

        {/* City Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>المدينة / المنطقة</Text>
          <View style={styles.chipsWrap}>
            {CITIES.map((city) => (
              <Pressable
                key={city}
                onPress={() => setSelectedCity(city)}
                style={[
                  styles.chip,
                  selectedCity === city && styles.chipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedCity === city && styles.chipTextSelected,
                  ]}
                >
                  {city}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Age Group */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الفئة العمرية</Text>
          <View style={styles.chipsWrap}>
            {AGE_GROUPS.map((age) => (
              <Pressable
                key={age}
                onPress={() => setSelectedAge(age)}
                style={[
                  styles.chip,
                  selectedAge === age && styles.chipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedAge === age && styles.chipTextSelected,
                  ]}
                >
                  {age} سنة
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Skin Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>نوع البشرة</Text>
          <View style={styles.chipsWrap}>
            {SKIN_TYPES.map((type) => (
              <Pressable
                key={type.label}
                onPress={() => setSelectedSkin(type.label)}
                style={[
                  styles.chip,
                  selectedSkin === type.label && styles.chipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedSkin === type.label && styles.chipTextSelected,
                  ]}
                >
                  {type.label} ({type.desc})
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Hair Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>نوع الشعر</Text>
          <View style={styles.chipsWrap}>
            {HAIR_TYPES.map((type) => (
              <Pressable
                key={type.label}
                onPress={() => setSelectedHair(type.label)}
                style={[
                  styles.chip,
                  selectedHair === type.label && styles.chipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedHair === type.label && styles.chipTextSelected,
                  ]}
                >
                  {type.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Skin Concerns & Goals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>أهداف واهتمامات العناية</Text>
          <View style={styles.chipsWrap}>
            {CONCERNS.map((item) => {
              const active = selectedConcerns.includes(item);
              return (
                <Pressable
                  key={item}
                  onPress={() => toggleConcern(item)}
                  style={[styles.chip, active && styles.chipSelected]}
                >
                  <MaterialIcons
                    name={active ? "check-circle" : "add-circle-outline"}
                    size={16}
                    color={active ? "white" : "#be185d"}
                  />
                  <Text
                    style={[styles.chipText, active && styles.chipTextSelected]}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Preferred Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الأقسام المفضلة لديكِ</Text>
          <View style={styles.chipsWrap}>
            {CATEGORIES.map((cat) => {
              const active = selectedCategories.includes(cat);
              return (
                <Pressable
                  key={cat}
                  onPress={() => toggleCategory(cat)}
                  style={[styles.chip, active && styles.chipSelected]}
                >
                  <MaterialIcons
                    name={active ? "favorite" : "favorite-border"}
                    size={16}
                    color={active ? "white" : "#be185d"}
                  />
                  <Text
                    style={[styles.chipText, active && styles.chipTextSelected]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Save Button */}
        <View style={styles.actionContainer}>
          <Pressable
            onPress={() => void handleSave()}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveButton,
              saving && styles.saveButtonDisabled,
              pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
            ]}
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <View style={styles.saveInner}>
                <MaterialIcons name="check" size={20} color="white" />
                <Text style={styles.saveText}>حفظ ومتابعة إلى المتجر</Text>
              </View>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
    width: "100%",
    maxWidth: 580,
    alignSelf: "center",
  },
  topBar: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  skipBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  skipText: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "700",
  },
  stepBadge: {
    backgroundColor: "#fce7f3",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  stepText: {
    color: "#be185d",
    fontSize: 12,
    fontWeight: "800",
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#1e1b4b",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  section: {
    backgroundColor: "white",
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ffe4e6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1e293b",
    textAlign: "right",
    marginBottom: 12,
  },
  avatarMainWrap: {
    alignSelf: "center",
    position: "relative",
    marginBottom: 12,
  },
  avatarMain: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: "#be185d",
  },
  avatarBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#be185d",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  avatarOption: {
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "transparent",
    padding: 2,
  },
  avatarOptionSelected: {
    borderColor: "#be185d",
  },
  avatarOptionImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: "#0f172a",
    paddingVertical: 0,
  },
  chipsWrap: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff1f2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffe4e6",
  },
  chipSelected: {
    backgroundColor: "#be185d",
    borderColor: "#be185d",
  },
  chipText: {
    fontSize: 13,
    color: "#9f1239",
    fontWeight: "700",
  },
  chipTextSelected: {
    color: "white",
    fontWeight: "800",
  },
  actionContainer: {
    marginTop: 8,
    marginBottom: 20,
  },
  saveButton: {
    backgroundColor: "#be185d",
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#be185d",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  saveText: {
    color: "white",
    fontSize: 15,
    fontWeight: "900",
  },
});
