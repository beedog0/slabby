Pod::Spec.new do |s|
  s.name           = 'LabelReader'
  s.version        = '1.0.0'
  s.summary        = 'Reads PSA slab label text on device with Apple Vision.'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'Slabby'
  s.homepage       = 'https://github.com/beedog0/slabby'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
