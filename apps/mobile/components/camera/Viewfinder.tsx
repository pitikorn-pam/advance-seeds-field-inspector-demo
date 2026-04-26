import { useEffect, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import type { CameraProps } from "react-native-vision-camera";
import { Linking } from "react-native";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";

interface Props {
  active?: boolean;
  /** Forwarded to the underlying Camera so callers can invoke `takePhoto` etc. */
  cameraRef?: RefObject<Camera | null>;
  /**
   * Children render OVER the camera preview — used for detection rings,
   * ROI overlays, glass-style chrome, etc. They sit at the same flex layer
   * as the Camera so they expand to fill the frame.
   */
  children?: ReactNode;
  /**
   * Optional Camera-component props passed through. Useful for setting fps,
   * format, photo / video flags. Vision-camera will pick the closest match
   * to the requested options on the selected device.
   */
  cameraProps?: Omit<Partial<CameraProps>, "ref" | "device" | "isActive">;
  /** Wrapper-level className (NativeWind). Default: flex-1 black. */
  className?: string;
}

/**
 * A thin wrapper around `react-native-vision-camera`'s `<Camera>` that
 * adds permission gating, device-not-found handling, and a slot for
 * children rendered over the live preview.
 */
export function Viewfinder({ active = true, cameraRef, children, cameraProps, className }: Props) {
  const { t } = useTranslation();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (!hasPermission && !requested) {
      setRequested(true);
      void requestPermission();
    }
  }, [hasPermission, requested, requestPermission]);

  if (!hasPermission) {
    return (
      <View className={`flex-1 items-center justify-center bg-black gap-md ${className ?? ""}`}>
        <Text className="text-white text-h2 font-medium">
          {t("inspections:capture.permissionRequired")}
        </Text>
        <Text className="text-white/70 text-body text-center px-xl">
          {t("inspections:capture.permissionHint")}
        </Text>
        <Button
          variant="outline"
          label={t("common:actions.openSettings")}
          onPress={() => void Linking.openSettings()}
        />
      </View>
    );
  }

  if (!device) {
    return (
      <View className={`flex-1 items-center justify-center bg-black gap-md ${className ?? ""}`}>
        <ActivityIndicator color="#FFFFFF" />
        <Text className="text-white/70 text-body">{t("inspections:capture.cameraStarting")}</Text>
      </View>
    );
  }

  return (
    <View className={`flex-1 bg-black ${className ?? ""}`}>
      <Camera
        ref={cameraRef}
        device={device}
        isActive={active}
        photo
        video
        audio
        style={{ flex: 1 }}
        {...cameraProps}
      />
      <View className="absolute inset-0">{children}</View>
    </View>
  );
}
