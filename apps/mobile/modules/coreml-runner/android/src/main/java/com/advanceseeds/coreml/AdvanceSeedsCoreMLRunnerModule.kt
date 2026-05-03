package com.advanceseeds.coreml

import android.content.Context
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

object AdvanceSeedsAppContextHolder {
  @Volatile var context: Context? = null
}

// Core ML APIs remain iOS-only, but this module also owns the Android native
// YOLO frame-processor plugin so live camera inference can stay off the JS
// bridge.
class AdvanceSeedsCoreMLRunnerModule : Module() {
  companion object {
    init {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("advanceSeedsRunTFLite") { _, _ ->
        AdvanceSeedsTfliteFrameProcessorPlugin()
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("AdvanceSeedsCoreMLRunner")

    OnCreate {
      AdvanceSeedsAppContextHolder.context = appContext.reactContext?.applicationContext
    }

    OnDestroy {
      AdvanceSeedsAppContextHolder.context = null
    }

    AsyncFunction("loadModel") { _: String ->
      throw NotSupportedOnAndroidException()
      Unit
    }

    AsyncFunction("loadModelAtPath") { _: String ->
      throw NotSupportedOnAndroidException()
      Unit
    }

    AsyncFunction("compileModelPackage") { _: String, _: String ->
      throw NotSupportedOnAndroidException()
      Unit
    }

    AsyncFunction("runOnImageURL") { _: String, _: String ->
      throw NotSupportedOnAndroidException()
      Unit
    }

    AsyncFunction("runOnImageURLAtPath") { _: String, _: String ->
      throw NotSupportedOnAndroidException()
      Unit
    }
  }
}

private class NotSupportedOnAndroidException :
  CodedException("Core ML is iOS-only. Use the TFLite analyzer on Android.")
