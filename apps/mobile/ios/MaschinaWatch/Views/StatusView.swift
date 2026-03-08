import SwiftUI

struct StatusView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        VStack(spacing: 8) {
            Label("\(store.activeRuns)", systemImage: "cpu")
                .font(.title2.bold())
            Text("active runs")
                .font(.caption2)
                .foregroundStyle(.secondary)

            Divider()

            Label("\(store.agents.count)", systemImage: "list.bullet")
                .font(.body)
            Text("total agents")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .navigationTitle("Status")
        .refreshable { await store.fetchAgents() }
    }
}
