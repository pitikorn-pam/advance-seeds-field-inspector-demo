import { useMemo, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { View, Text, ActivityIndicator, Linking, Platform } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  useMicrophonePermission,
} from "react-native-vision-camera";
import type { CameraProps } from "react-native-vision-camera";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";

interface Props {
  active?: boolean;
  /** Forwarded to the underlying Camera so callers can invoke `takePhoto` etc. */
  cameraRef?: RefObject<Camera | null>;
  /** Lens to use. "back" by default; "front" for selfie / flip. */
  position?: "back" | "front";
  /** Renders a 3×3 rule-of-thirds grid over the preview when true. */
  showGrid?: boolean;
  /**
   * Children render OVER the camera preview — used for detection rings,
   * ROI overlays, glass-style chrome, etc. They sit at the same flex layer
   * as the Camera so they expand to fill the frame.
   */
  children?: ReactNode;
  /**
   * Optional Camera-component props passed through. Useful for setting fps,
   * format, photo / video flags. Vision-camera will pick the closest match
   * to the requested options on the selected device. If `audio: true` is
   * requested but the mic permission is denied, we silently downgrade to
   * audio: false rather than crashing the camera mount.
   */
  cameraProps?: Omit<Partial<CameraProps>, "ref" | "device" | "isActive">;
  /** Wrapper-level className (NativeWind). Default: flex-1 black. */
  className?: string;
}

/**
 * A thin wrapper around `react-native-vision-camera`'s `<Camera>` that
 * adds permission gating, device-not-found handling, position swap,
 * grid overlay, and a slot for children rendered over the live preview.
 */
export function Viewfinder({
  active = true,
  cameraRef,
  position = "back",
  showGrid = false,
  children,
  cameraProps,
  className,
}: Props) {
  const { t } = useTranslation();
  const camPerm = useCameraPermission();
  const micPerm = useMicrophonePermission();
  const device = useCameraDevice(position);
  const cameraFps = Platform.OS === "android" ? 15 : 30;
  const cameraResolution =
    Platform.OS === "android" ? { width: 1280, height: 720 } : { width: 1920, height: 1080 };

  // Vision Camera requires both `format` and `fps` to constrain capture rate.
  // Android uses a lower-pressure 720p/15 stream so CameraX does less YUV ->
  // ARGB work before the live detector resize step; iOS keeps the sharper
  // 1080p/30 Core ML path.
  const format = useCameraFormat(device, [
    { videoResolution: cameraResolution },
    { photoResolution: cameraResolution },
    { fps: cameraFps },
  ]);
  const [requesting, setRequesting] = useState(false);

  const requestPermissions = async () => {
    setRequesting(true);
    try {
      await camPerm.requestPermission();
      if (!micPerm.hasPermission) await micPerm.requestPermission();
    } finally {
      setRequesting(false);
    }
  };

  if (!camPerm.hasPermission) {
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
          label={requesting ? t("common:states.loading") : t("common:actions.continue")}
          disabled={requesting}
          onPress={() => void requestPermissions()}
        />
        <Button
          variant="ghost"
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

  // Strip `audio: true` if mic permission is missing — Vision Camera throws
  // a microphone-permission-denied error on mount otherwise. Recording will
  // re-request permission on demand if the user tries it.
  const safeCameraProps = useMemo(
    () =>
      cameraProps?.audio && !micPerm.hasPermission ? { ...cameraProps, audio: false } : cameraProps,
    [cameraProps, micPerm.hasPermission],
  );

  if (!active) {
    return (
      <View className={`flex-1 bg-black ${className ?? ""}`}>
        {showGrid ? <GridOverlay /> : null}
        <View className="absolute inset-0">{children}</View>
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
        // Constrain native camera delivery. Android gets 720p/15 because the
        // resize plugin converts the full camera frame before cropping; keeping
        // the Camera2 stream smaller gives ImageAnalysis enough room during
        // sustained ArUco + YOLO work. Vision Camera requires `format` paired
        // with `fps`.
        format={format}
        fps={cameraFps}
        style={{ flex: 1 }}
        // `video` + `audio` deliberately omitted from defaults — they spin up
        // additional native surfaces (encoder, mic stream) that we don't need
        // for photo capture and that contribute to the rnscreens
        // `getChildDrawingOrder` crash on stack transitions. Phase 7b's
        // recording flow opts in via `cameraProps={{ video: true, audio: true }}`.
        {...safeCameraProps}
      />
      {showGrid ? <GridOverlay /> : null}
      <View className="absolute inset-0">{children}</View>
    </View>
  );
}

/**
 * Rule-of-thirds grid. Rendered as four 0.5px lines at 33% and 66% of the
 * viewport in each axis. White at 35% opacity reads against most scenes
 * without competing with detection rings or the KPI strip.
 */
function GridOverlay() {
  const stroke = "rgba(255,255,255,0.35)";
  return (
    <View className="absolute inset-0" pointerEvents="none">
      <View
        style={{
          position: "absolute",
          left: "33.333%",
          top: 0,
          bottom: 0,
          width: 0.5,
          backgroundColor: stroke,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: "66.666%",
          top: 0,
          bottom: 0,
          width: 0.5,
          backgroundColor: stroke,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: "33.333%",
          left: 0,
          right: 0,
          height: 0.5,
          backgroundColor: stroke,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: "66.666%",
          left: 0,
          right: 0,
          height: 0.5,
          backgroundColor: stroke,
        }}
      />
    </View>
  );
}
