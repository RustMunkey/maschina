import SwiftUI

struct DashboardView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text("Welcome to Maschina")
                    .font(.headline)
            }
            .navigationTitle("Dashboard")
        }
    }
}
