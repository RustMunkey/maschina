# Maschina iOS

Swift + SwiftUI iOS application.

## Xcode setup

The Xcode project must be created manually (Xcode can't generate `.xcodeproj` from CLI for SwiftUI apps):

1. Open Xcode
2. File → New → Project → iOS → App
3. Product Name: `Maschina`
4. Bundle Identifier: `io.maschina.ios`
5. Interface: SwiftUI
6. Language: Swift
7. Save to `apps/mobile/ios/`

Then add the existing source files:
- In Xcode, right-click the `Maschina` group → Add Files → select the `Maschina/` folder (App, Screens, Data, Theme, Components)

## API

`APIClient.swift` points to:
- Debug: `http://localhost:8080` (gateway running locally)
- Release: `https://api.maschina.io`

Token is stored in `UserDefaults` under `maschina_token`.

## Running

Select an iPhone simulator and press Run (⌘R).
