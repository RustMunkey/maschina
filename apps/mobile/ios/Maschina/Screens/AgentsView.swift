import SwiftUI

struct AgentsView: View {
    var body: some View {
        NavigationStack {
            List {
                Text("No agents yet")
                    .foregroundStyle(.secondary)
            }
            .navigationTitle("Agents")
        }
    }
}
