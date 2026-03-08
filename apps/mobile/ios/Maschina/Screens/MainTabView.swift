import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("Home", systemImage: "house") }

            AgentsView()
                .tabItem { Label("Agents", systemImage: "cpu") }

            UsageView()
                .tabItem { Label("Usage", systemImage: "chart.bar") }

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}
