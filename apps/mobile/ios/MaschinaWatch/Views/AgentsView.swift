import SwiftUI

struct AgentsView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        Group {
            if store.isLoading {
                ProgressView()
            } else if store.agents.isEmpty {
                Text("No agents")
                    .foregroundStyle(.secondary)
            } else {
                List(store.agents) { agent in
                    AgentRow(agent: agent)
                }
                .listStyle(.carousel)
            }
        }
        .navigationTitle("Agents")
        .refreshable { await store.fetchAgents() }
    }
}

struct AgentRow: View {
    let agent: WatchAgent

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(agent.name)
                .font(.body)
                .lineLimit(1)
            Text(agent.status)
                .font(.caption2)
                .foregroundStyle(statusColor)
        }
    }

    private var statusColor: Color {
        switch agent.status {
        case "running":  return .green
        case "error":    return .red
        case "idle":     return .secondary
        default:         return .secondary
        }
    }
}
