require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'AdvanceSeedsCoreMLRunner'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'UNLICENSED'
  s.author         = 'Advance Seeds'
  s.homepage       = 'https://advanceseeds.local'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'VisionCamera'
  s.frameworks    = ['CoreML', 'Vision']
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "**/*.{h,m,mm,swift}"
  s.public_header_files = "**/*.h"
  # Compiled Core ML model. Bundled directly into the host app's resources
  # so `Bundle.main.url(forResource: "yolo26n", withExtension: "mlmodelc")`
  # resolves at runtime.
  s.resources = ["yolo26n.mlmodelc"]
end
