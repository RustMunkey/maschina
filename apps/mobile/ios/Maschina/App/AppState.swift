import Foundation
import Combine

final class AppState: ObservableObject {
    @Published var isAuthenticated: Bool = false
    @Published var token: String? = nil

    init() {
        token = UserDefaults.standard.string(forKey: "maschina_token")
        isAuthenticated = token != nil
    }

    func setToken(_ t: String) {
        token = t
        isAuthenticated = true
        UserDefaults.standard.set(t, forKey: "maschina_token")
    }

    func clearToken() {
        token = nil
        isAuthenticated = false
        UserDefaults.standard.removeObject(forKey: "maschina_token")
    }
}
