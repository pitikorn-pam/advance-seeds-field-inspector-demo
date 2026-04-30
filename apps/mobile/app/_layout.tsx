import "@/global.css";
import { useEffect, useState } from "react";
import { Stack, SplashScreen, useSegments, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { View, ActivityIndicator } from "react-native";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { AnalyzerProvider } from "@/lib/analyzer/AnalyzerProvider";
import { bootstrapI18n } from "@/lib/i18n";
import { useOnboarded } from "@/lib/onboarding";
import { SyncQueueWorker } from "@/lib/sync/SyncQueueWorker";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

/**
 * Combined onboarding + auth gate.
 *
 * On every render we check three pieces of state — auth session, onboarding
 * flag, and the current route segment — and route once when transitions are
 * needed. Order of precedence:
 *
 *   1. If onboarding flag hasn't loaded yet, wait (no redirect).
 *   2. If user has never finished onboarding, force them onto /splash unless
 *      they're already in the onboarding stack (/splash or /welcome).
 *   3. If onboarded but signed out, force them to /login (unless already
 *      there, or in onboarding — onboarding's last step takes them to login
 *      itself).
 *   4. If onboarded and signed in, they belong in (tabs); only redirect them
 *      out of /login or /splash or /welcome — let them keep navigating
 *      anywhere else.
 */
function StartupGate() {
  const { session, loading } = useAuth();
  const onboarded = useOnboarded();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading || onboarded === null) return;
    const top = segments[0] ?? "";
    const inOnboarding = top === "splash" || top === "welcome";
    const inAuth = top === "login";

    if (!onboarded) {
      if (!inOnboarding) router.replace("/splash");
      return;
    }
    if (!session && !inAuth) {
      router.replace("/login");
      return;
    }
    if (session && (inAuth || inOnboarding)) {
      router.replace("/(tabs)");
    }
  }, [session, loading, onboarded, segments, router]);

  if (loading || onboarded === null) {
    return (
      <View className="flex-1 items-center justify-center bg-bg-secondary">
        <ActivityIndicator />
      </View>
    );
  }
  return null;
}

export default function RootLayout() {
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    void bootstrapI18n().then(() => {
      setI18nReady(true);
      void SplashScreen.hideAsync();
    });
  }, []);

  if (!i18nReady) {
    return null;
  }

  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <AnalyzerProvider>
                <StatusBar style="auto" />
                <StartupGate />
                <SyncQueueWorker />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    // iOS falls back to the previous screen's `title` for the
                    // header back-button label. Tab landings have no title
                    // (the tab bar IS their identity), so iOS reads the
                    // route group "(tabs)" as the back label and renders it
                    // verbatim. Forcing an empty backTitle hides it on iOS
                    // and keeps the back chevron alone — matches the
                    // prototype's icon-only back button.
                    headerBackTitle: " ",
                    headerBackButtonDisplayMode: "minimal",
                  }}
                >
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="login" options={{ animation: "fade" }} />
                  <Stack.Screen name="splash" options={{ animation: "fade" }} />
                  <Stack.Screen name="welcome" options={{ animation: "slide_from_right" }} />
                  <Stack.Screen name="profile" options={{ headerShown: false }} />
                  <Stack.Screen name="settings" options={{ headerShown: false }} />
                  <Stack.Screen
                    name="notifications"
                    options={{ presentation: "modal", headerShown: false }}
                  />
                  <Stack.Screen name="inspections/[id]" options={{ headerShown: false }} />
                  <Stack.Screen
                    name="seed/[inspection]/[index]"
                    options={{ headerShown: true, title: "" }}
                  />
                  {/* `(tabs)/inspect` is the tab landing that redirects into
                      the fullscreen `/capture/*` group below. The capture
                      stack itself sets headerShown false; the inner mode
                      and variety-picker screens opt into headers from
                      their own Stack.Screen options. */}
                  <Stack.Screen name="capture" options={{ headerShown: false }} />
                  <Stack.Screen name="more/history" options={{ headerShown: false }} />
                  <Stack.Screen name="more/recordings" options={{ headerShown: false }} />
                  <Stack.Screen name="varieties/[id]" options={{ headerShown: true, title: "" }} />
                  <Stack.Screen name="batches" options={{ headerShown: false }} />
                  <Stack.Screen name="reports" options={{ headerShown: false }} />
                  <Stack.Screen name="calibration" options={{ headerShown: false }} />
                </Stack>
              </AnalyzerProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
