use maschina_sdk::{MaschinaClient, MaschinaError};
use mockito::Server;

fn agent_json() -> serde_json::Value {
    serde_json::json!({
        "id": "00000000-0000-0000-0000-000000000001",
        "name": "Test Agent",
        "description": null,
        "agentType": "execution",
        "model": "claude-sonnet-4-6",
        "systemPrompt": "You are a test agent.",
        "status": "idle",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z"
    })
}

fn run_json() -> serde_json::Value {
    serde_json::json!({
        "id": "00000000-0000-0000-0000-000000000002",
        "agentId": "00000000-0000-0000-0000-000000000001",
        "status": "queued",
        "inputPayload": { "message": "hello" },
        "outputPayload": null,
        "inputTokens": null,
        "outputTokens": null,
        "durationMs": null,
        "errorCode": null,
        "errorMessage": null,
        "startedAt": null,
        "finishedAt": null,
        "createdAt": "2026-01-01T00:00:00Z"
    })
}

#[tokio::test]
async fn test_list_agents() {
    let mut server = Server::new_async().await;
    let mock = server
        .mock("GET", "/agents")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(serde_json::json!([agent_json()]).to_string())
        .create_async()
        .await;

    let client = MaschinaClient::with_base_url("test_key", server.url());
    let agents = client.list_agents().await.unwrap();
    assert_eq!(agents.len(), 1);
    assert_eq!(agents[0].name, "Test Agent");
    mock.assert_async().await;
}

#[tokio::test]
async fn test_get_agent() {
    let id = uuid::Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap();
    let mut server = Server::new_async().await;
    let mock = server
        .mock("GET", format!("/agents/{id}").as_str())
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(agent_json().to_string())
        .create_async()
        .await;

    let client = MaschinaClient::with_base_url("test_key", server.url());
    let agent = client.get_agent(id).await.unwrap();
    assert_eq!(agent.name, "Test Agent");
    mock.assert_async().await;
}

#[tokio::test]
async fn test_create_agent() {
    use maschina_sdk::types::{AgentType, CreateAgentInput};
    let mut server = Server::new_async().await;
    let mock = server
        .mock("POST", "/agents")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(agent_json().to_string())
        .create_async()
        .await;

    let client = MaschinaClient::with_base_url("test_key", server.url());
    let input = CreateAgentInput {
        name: "Test Agent".to_string(),
        description: None,
        agent_type: AgentType::Execution,
        model: None,
        system_prompt: None,
    };
    let agent = client.create_agent(&input).await.unwrap();
    assert_eq!(agent.name, "Test Agent");
    mock.assert_async().await;
}

#[tokio::test]
async fn test_run_agent() {
    use maschina_sdk::types::RunAgentInput;
    let id = uuid::Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap();
    let mut server = Server::new_async().await;
    let mock = server
        .mock("POST", format!("/agents/{id}/run").as_str())
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(run_json().to_string())
        .create_async()
        .await;

    let client = MaschinaClient::with_base_url("test_key", server.url());
    let input = RunAgentInput {
        message: "hello".to_string(),
        context: None,
    };
    let run = client.run_agent(id, &input).await.unwrap();
    assert_eq!(run.agent_id, id);
    mock.assert_async().await;
}

#[tokio::test]
async fn test_delete_agent() {
    let id = uuid::Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap();
    let mut server = Server::new_async().await;
    let mock = server
        .mock("DELETE", format!("/agents/{id}").as_str())
        .with_status(204)
        .create_async()
        .await;

    let client = MaschinaClient::with_base_url("test_key", server.url());
    client.delete_agent(id).await.unwrap();
    mock.assert_async().await;
}

#[tokio::test]
async fn test_api_error_401() {
    let mut server = Server::new_async().await;
    server
        .mock("GET", "/agents")
        .with_status(401)
        .with_header("content-type", "application/json")
        .with_body(r#"{"error":{"message":"Invalid API key","code":"unauthorized"}}"#)
        .create_async()
        .await;

    let client = MaschinaClient::with_base_url("bad_key", server.url());
    let err = client.list_agents().await.unwrap_err();
    assert!(matches!(err, MaschinaError::Api { status: 401, .. }));
}

#[tokio::test]
async fn test_sends_auth_header() {
    let mut server = Server::new_async().await;
    let mock = server
        .mock("GET", "/agents")
        .match_header("authorization", "Bearer msk_test")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body("[]")
        .create_async()
        .await;

    let client = MaschinaClient::with_base_url("msk_test", server.url());
    client.list_agents().await.unwrap();
    mock.assert_async().await;
}
