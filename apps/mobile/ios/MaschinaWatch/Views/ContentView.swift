import SwiftUI

struct ContentView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        TabView {
            AgentsView()
                .tabItem { Label("Agents", systemImage: "cpu") }

            StatusView()
                .tabItem { Label("Status", systemImage: "chart.bar") }
        }
    }
}
