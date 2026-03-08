import SwiftUI

private struct LoginResponse: Decodable {
    struct Data: Decodable { let token: String }
    let data: Data
}

private struct LoginRequest: Encodable {
    let email: String
    let password: String
}

struct LoginView: View {
    @EnvironmentObject var appState: AppState
    @State private var email = ""
    @State private var password = ""
    @State private var errorMessage: String?
    @State private var isLoading = false

    var body: some View {
        VStack(spacing: 20) {
            Spacer()

            Text("Maschina")
                .font(.largeTitle)
                .fontWeight(.bold)

            Spacer().frame(height: 16)

            TextField("Email", text: $email)
                .textFieldStyle(.roundedBorder)
                .keyboardType(.emailAddress)
                .autocapitalization(.none)

            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)

            if let err = errorMessage {
                Text(err).foregroundStyle(.red).font(.caption)
            }

            Button(action: login) {
                if isLoading {
                    ProgressView()
                } else {
                    Text("Sign in").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isLoading)

            Spacer()
        }
        .padding(24)
    }

    private func login() {
        isLoading = true
        errorMessage = nil
        Task {
            do {
                let res: LoginResponse = try await APIClient.shared.post(
                    "/auth/login",
                    body: LoginRequest(email: email, password: password)
                )
                await MainActor.run {
                    appState.setToken(res.data.token)
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isLoading = false
                }
            }
        }
    }
}
