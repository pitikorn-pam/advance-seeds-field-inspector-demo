package com.advanceseeds.coreml

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Android stub. Core ML is iOS-only; on Android the JS layer routes
// inference through the existing TFLite analyzer instead.
class AdvanceSeedsCoreMLRunnerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AdvanceSeedsCoreMLRunner")

    AsyncFunction("loadModel") { _: String ->
      throw NotSupportedOnAndroidException()
    }

    AsyncFunction("runOnImageURL") { _: String, _: String ->
      throw NotSupportedOnAndroidException()
    }
  }
}

private class NotSupportedOnAndroidException :
  CodedException("Core ML is iOS-only. Use the TFLite analyzer on Android.")
