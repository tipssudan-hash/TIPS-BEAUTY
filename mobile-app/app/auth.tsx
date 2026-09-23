import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
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
import { signIn, signUp } from "@/lib/tips-api";

const LOGO = require("../assets/images/tips-logo.png");

// Google Icon Component
function GoogleIcon() {
  return (
    <View style={styles.googleIconCircle}>
      <Text style={styles.googleG}>G</Text>
    </View>
  );
}

export default function AuthScreen() {
  const { setSession, configured } = useTipsStore();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    setMessage("");

    if (!configured) {
      setError("أكملي ربط قاعدة بيانات Supabase أولاً.");
      return;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("يرجى إدخال بريد إلكتروني صحيح.");
      return;
    }

    if (password.length < 6) {
      setError("كلمة المرور يجب ألا تقل عن 6 أحرف.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين، يرجى التأكد وإعادة المحاولة.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signin") {
        const session = await signIn(cleanEmail, password);
        await setSession(session);
        router.back();
      } else {
        await signUp(cleanEmail, password);
        // Direct transition from signup to profile setup page
        try {
          const session = await signIn(cleanEmail, password);
          await setSession(session);
          router.replace("/setup-profile" as never);
        } catch {
          // If email confirmation is required by Supabase
          setMessage("تم إنشاء حسابك بنجاح! انتقلي لإعداد ملفك الشخصي.");
          setTimeout(() => {
            router.replace("/setup-profile" as never);
          }, 1200);
        }
      }
    } catch (e: any) {
      const rawMsg = e?.message || "";
      if (rawMsg.includes("Invalid login credentials")) {
        setError("بيانات الدخول غير صحيحة، أو الحساب بانتظار تأكيد البريد.");
      } else if (rawMsg.includes("User already registered")) {
        setError("هذا البريد الإلكتروني مسجل مسبقاً، سجلي الدخول بدلاً من ذلك.");
      } else {
        setError(rawMsg || "تعذر إكمال العملية، يرجى المحاولة لاحقاً.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = () => {
    setGoogleLoading(true);
    // UI-only action feedback
    setTimeout(() => {
      setGoogleLoading(false);
      router.replace("/setup-profile" as never);
    }, 900);
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#fff7fa]">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Close Button */}
          <Pressable
            onPress={() => router.back()}
            style={styles.closeBtn}
            hitSlop={12}
          >
            <MaterialIcons name="close" size={24} color="#64748b" />
          </Pressable>

          {/* Header & Logo */}
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Image source={LOGO} style={styles.logo} resizeMode="contain" />
            </View>
            <Text style={styles.title}>
              {mode === "signin" ? "مرحباً بعودتك إلى تيبس" : "انضمي لعالم تيبس بيوتي"}
            </Text>
            <Text style={styles.subtitle}>
              {mode === "signin"
                ? "سجلي دخولك لمتابعة طلباتك، تجميع نقاط الجمال، والمزيد."
                : "أنشئي حسابك واحصلي على نقاط ترحيبية وتجربة تسوق مخصصة."}
            </Text>
          </View>

          {/* Tab Switcher */}
          <View style={styles.tabsContainer}>
            <Pressable
              onPress={() => {
                setMode("signin");
                setError("");
                setMessage("");
              }}
              style={[styles.tab, mode === "signin" && styles.activeTab]}
            >
              <Text
                style={[
                  styles.tabText,
                  mode === "signin" && styles.activeTabText,
                ]}
              >
                تسجيل الدخول
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMode("signup");
                setError("");
                setMessage("");
              }}
              style={[styles.tab, mode === "signup" && styles.activeTab]}
            >
              <Text
                style={[
                  styles.tabText,
                  mode === "signup" && styles.activeTabText,
                ]}
              >
                إنشاء حساب جديد
              </Text>
            </Pressable>
          </View>

          {/* Google Sign-In Button (UI Only) */}
          <Pressable
            onPress={handleGoogleAuth}
            disabled={googleLoading}
            style={({ pressed }) => [
              styles.googleButton,
              pressed && styles.googleButtonPressed,
            ]}
          >
            {googleLoading ? (
              <ActivityIndicator color="#475569" />
            ) : (
              <View style={styles.googleBtnInner}>
                <GoogleIcon />
                <Text style={styles.googleBtnText}>
                  {mode === "signin"
                    ? "تسجيل الدخول باستخدام Google"
                    : "إنشاء حساب عبر Google"}
                </Text>
              </View>
            )}
          </Pressable>

          {/* Divider */}
          <View style={styles.dividerWrap}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>أو عبر البريد الإلكتروني</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Alerts */}
          {error ? (
            <View style={styles.errorBox}>
              <MaterialIcons name="error-outline" size={20} color="#b91c1c" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {message ? (
            <View style={styles.messageBox}>
              <MaterialIcons name="check-circle-outline" size={20} color="#047857" />
              <Text style={styles.messageText}>{message}</Text>
            </View>
          ) : null}

          {/* Form Fields */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>البريد الإلكتروني</Text>
              <View style={styles.inputWrapper}>
                <MaterialIcons name="mail-outline" size={20} color="#94a3b8" />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="name@example.com"
                  placeholderTextColor="#94a3b8"
                  style={styles.textInput}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  textAlign="right"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>كلمة المرور</Text>
              <View style={styles.inputWrapper}>
                <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                  <MaterialIcons
                    name={showPassword ? "visibility" : "visibility-off"}
                    size={20}
                    color="#94a3b8"
                  />
                </Pressable>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="لا تقل عن 6 أحرف"
                  placeholderTextColor="#94a3b8"
                  style={styles.textInput}
                  secureTextEntry={!showPassword}
                  textAlign="right"
                />
                <MaterialIcons name="lock-outline" size={20} color="#94a3b8" />
              </View>
            </View>

            {mode === "signup" ? (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>تأكيد كلمة المرور</Text>
                <View style={styles.inputWrapper}>
                  <Pressable
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    hitSlop={8}
                  >
                    <MaterialIcons
                      name={showConfirmPassword ? "visibility" : "visibility-off"}
                      size={20}
                      color="#94a3b8"
                    />
                  </Pressable>
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="أعيدي إدخال كلمة المرور"
                    placeholderTextColor="#94a3b8"
                    style={styles.textInput}
                    secureTextEntry={!showConfirmPassword}
                    textAlign="right"
                  />
                  <MaterialIcons
                    name="verified-user"
                    size={20}
                    color={
                      confirmPassword && password === confirmPassword
                        ? "#059669"
                        : "#94a3b8"
                    }
                  />
                </View>
              </View>
            ) : null}

            {/* Submit Button */}
            <Pressable
              onPress={() => void submit()}
              disabled={loading}
              style={({ pressed }) => [
                styles.submitButton,
                loading && styles.submitButtonDisabled,
                pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <View style={styles.submitInner}>
                  <MaterialIcons
                    name={mode === "signin" ? "login" : "arrow-forward"}
                    size={20}
                    color="white"
                  />
                  <Text style={styles.submitText}>
                    {mode === "signin"
                      ? "تسجيل الدخول"
                      : "إنشاء الحساب ومتابعة إعداد الملف"}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Footer Security Badge */}
          <View style={styles.footerBadge}>
            <MaterialIcons name="verified-user" size={18} color="#059669" />
            <Text style={styles.footerText}>
              اتصال آمن ومحمي بأحدث معايير التشفير
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 36,
    justifyContent: "center",
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    left: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    zIndex: 10,
  },
  header: {
    alignItems: "center",
    marginBottom: 18,
    marginTop: 18,
  },
  logoBadge: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#e11d48",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ffe4e6",
  },
  logo: {
    width: 64,
    height: 64,
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
    paddingHorizontal: 12,
  },
  tabsContainer: {
    flexDirection: "row-reverse",
    backgroundColor: "#f1f5f9",
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 11,
  },
  activeTab: {
    backgroundColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
  },
  activeTabText: {
    color: "#be185d",
    fontWeight: "900",
  },
  googleButton: {
    backgroundColor: "white",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  googleButtonPressed: {
    backgroundColor: "#f8fafc",
    transform: [{ scale: 0.99 }],
  },
  googleBtnInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  googleIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#ea4335",
    alignItems: "center",
    justifyContent: "center",
  },
  googleG: {
    color: "white",
    fontSize: 15,
    fontWeight: "900",
  },
  googleBtnText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },
  dividerWrap: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e2e8f0",
  },
  dividerText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
  },
  errorBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: "#b91c1c",
    fontSize: 12,
    textAlign: "right",
    lineHeight: 18,
    fontWeight: "600",
  },
  messageBox: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
    gap: 8,
  },
  messageText: {
    flex: 1,
    color: "#047857",
    fontSize: 12,
    textAlign: "right",
    lineHeight: 18,
    fontWeight: "600",
  },
  form: {
    gap: 14,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    textAlign: "right",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 14,
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
  submitButton: {
    backgroundColor: "#be185d",
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    shadowColor: "#be185d",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitInner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  submitText: {
    color: "white",
    fontSize: 14,
    fontWeight: "900",
  },
  footerBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 20,
  },
  footerText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
  },
});
