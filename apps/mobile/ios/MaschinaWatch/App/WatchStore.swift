import Foundation
import WatchConnectivity

/// Central state for the watch app.
/// Receives updates from the iPhone via WatchConnectivity when in range,
/// or fetches directly from the API over WiFi/LTE when standalone.
class WatchStore: NSObject, ObservableObject {
    @Published var agents: [WatchAgent] = []
    @Published var activeRuns: Int = 0
    @Published var isConnected: Bool = false
    @Published var isLoading: Bool = false
    @Published var error: String? = nil

    private let session = WCSession.default
    private let apiBase = "https://api.maschina.io"

    override init() {
        super.init()
        if WCSession.isSupported() {
            session.delegate = self
            session.activate()
        }
        Task { await fetchAgents() }
    }

    @MainActor
    func fetchAgents() async {
        isLoading = true
        defer { isLoading = false }

        guard let token = UserDefaults.standard.string(forKey: "maschina_token"),
              let url = URL(string: "\(apiBase)/agents") else { return }

        var req = URLRequest(url: url)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            let decoded = try JSONDecoder().decode([WatchAgent].self, from: data)
            agents = decoded
            activeRuns = decoded.filter { $0.status == "running" }.count
        } catch {
            self.error = error.localizedDescription
        }
    }
}

extension WatchStore: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async { self.isConnected = state == .activated }
    }

    func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        DispatchQueue.main.async {
            if let token = context["token"] as? String {
                UserDefaults.standard.set(token, forKey: "maschina_token")
                Task { await self.fetchAgents() }
            }
        }
    }
}

struct WatchAgent: Identifiable, Decodable {
    let id: String
    let name: String
    let status: String
    let agentType: String

    enum CodingKeys: String, CodingKey {
        case id, name, status, agentType
    }
}
