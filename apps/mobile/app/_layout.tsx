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

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function AuthRedirect() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "login";
    if (!session && !inAuthGroup) {
      router.replace("/login");
    } else if (session && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [session, loading, segments, router]);

  if (loading) {
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
                <AuthRedirect />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="login" options={{ animation: "fade" }} />
                  <Stack.Screen
                    name="inspections/[id]"
                    options={{ headerShown: true, title: "" }}
                  />
                  <Stack.Screen name="capture" options={{ presentation: "modal" }} />
                  <Stack.Screen name="varieties" options={{ headerShown: true, title: "" }} />
                  <Stack.Screen name="batches" options={{ headerShown: true, title: "" }} />
                  <Stack.Screen name="reports" options={{ headerShown: true, title: "" }} />
                  <Stack.Screen name="calibration" options={{ headerShown: true, title: "" }} />
                </Stack>
              </AnalyzerProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
