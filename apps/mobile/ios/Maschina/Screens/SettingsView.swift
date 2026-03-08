import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button("Sign out", role: .destructive) {
                        appState.clearToken()
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}
