use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use warp::ws::{Message, WebSocket};
use warp::Filter;
use futures_util::{StreamExt, SinkExt};

type Clients = Arc<RwLock<HashMap<String, mpsc::UnboundedSender<Message>>>>;

#[tokio::main]
async fn main() {
    println!("[HealingNodes] Phase 5 Rust Signaling Server starting on 0.0.0.0:3000");

    let clients: Clients = Arc::new(RwLock::new(HashMap::new()));

    let clients_filter = warp::any().map(move || clients.clone());

    let signaling_route = warp::path("ws")
        .and(warp::ws())
        .and(clients_filter)
        .map(|ws: warp::ws::Ws, clients| {
            ws.on_upgrade(move |socket| handle_connection(socket, clients))
        });

    warp::serve(signaling_route).run(([0, 0, 0, 0], 3000)).await;
}

async fn handle_connection(ws: WebSocket, clients: Clients) {
    let (mut client_ws_tx, mut client_ws_rx) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel();
    
    let client_id = uuid::Uuid::new_v4().to_string();
    clients.write().await.insert(client_id.clone(), tx);
    
    println!("[Signaling] Client connected: {}", client_id);

    tokio::task::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let _ = client_ws_tx.send(msg).await;
        }
    });

    while let Some(result) = client_ws_rx.next().await {
        if let Ok(msg) = result {
            if msg.is_text() {
                // Broadcast SDP/ICE candidates to all other peers
                let clients_guard = clients.read().await;
                for (id, sender) in clients_guard.iter() {
                    if id != &client_id {
                        let _ = sender.send(msg.clone());
                    }
                }
            }
        }
    }

    clients.write().await.remove(&client_id);
    println!("[Signaling] Client disconnected: {}", client_id);
}
