# Model Assets

The base app intentionally does not bundle detector weights.

Models are resolved through the registry and installed into the app sandbox at
runtime. Do not add `.tflite`, `.mlpackage`, or `.mlmodelc` files here for a
release build; that bypasses the install flow and increases the initial app
download size.
