import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case requestFailed(Int, String)
    case decodingFailed(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .requestFailed(_, let msg): return msg
        case .decodingFailed(let e): return e.localizedDescription
        }
    }
}

struct APIErrorBody: Decodable {
    struct Inner: Decodable { let message: String }
    let error: Inner
}

final class APIClient {
    static let shared = APIClient()

    #if DEBUG
    private let base = URL(string: "http://localhost:8080")!
    #else
    private let base = URL(string: "https://api.maschina.ai")!
    #endif

    private var token: String? { UserDefaults.standard.string(forKey: "maschina_token") }

    private func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: (any Encodable)? = nil
    ) async throws -> T {
        guard let url = URL(string: path, relativeTo: base) else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        if let body { req.httpBody = try JSONEncoder().encode(body) }

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.requestFailed(0, "No response") }

        if !(200..<300).contains(http.statusCode) {
            let msg = (try? JSONDecoder().decode(APIErrorBody.self, from: data))?.error.message ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw APIError.requestFailed(http.statusCode, msg)
        }

        return try JSONDecoder().decode(T.self, from: data)
    }

    func get<T: Decodable>(_ path: String) async throws -> T {
        try await request(path)
    }

    func post<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        try await request(path, method: "POST", body: body)
    }

    func delete<T: Decodable>(_ path: String) async throws -> T {
        try await request(path, method: "DELETE")
    }
}
