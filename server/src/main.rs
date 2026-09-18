use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use warp::ws::{Message, WebSocket};
use warp::Filter;
use futures_util::{StreamExt, SinkExt};

// WebRTC-RS Imports for the SFU
use webrtc::api::APIBuilder;
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::MediaEngine;
use webrtc::interceptor::registry::Registry;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;

type Clients = Arc<RwLock<HashMap<String, mpsc::UnboundedSender<Message>>>>;
// Global broadcaster track that takes packets from Host and distributes to N Listeners
type BroadcasterTrack = Arc<RwLock<Option<Arc<TrackLocalStaticRTP>>>>;

#[tokio::main]
async fn main() {
    println!("[HealingNodes] Phase 5 Rust WebRTC SFU starting on 0.0.0.0:3000");

    let clients: Clients = Arc::new(RwLock::new(HashMap::new()));
    let broadcaster_track: BroadcasterTrack = Arc::new(RwLock::new(None));

    let clients_filter = warp::any().map(move || clients.clone());
    let track_filter = warp::any().map(move || broadcaster_track.clone());

    let signaling_route = warp::path("ws")
        .and(warp::ws())
        .and(clients_filter)
        .and(track_filter)
        .map(|ws: warp::ws::Ws, clients, track| {
            ws.on_upgrade(move |socket| handle_sfu_connection(socket, clients, track))
        });

    warp::serve(signaling_route).run(([0, 0, 0, 0], 3000)).await;
}

async fn handle_sfu_connection(ws: WebSocket, clients: Clients, _broadcaster_track: BroadcasterTrack) {
    let (mut client_ws_tx, mut client_ws_rx) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel();
    
    let client_id = uuid::Uuid::new_v4().to_string();
    clients.write().await.insert(client_id.clone(), tx);
    
    println!("[Signaling] Client connected: {}", client_id);

    // 1. Initialize WebRTC Media Engine
    let mut m = MediaEngine::default();
    m.register_default_codecs().expect("Failed to register codecs");
    let mut registry = Registry::new();
    registry = register_default_interceptors(registry, &mut m).expect("Failed to register interceptors");
    
    let api = APIBuilder::new()
        .with_media_engine(m)
        .with_interceptor_registry(registry)
        .build();

    let config = RTCConfiguration::default();
    
    // We instantiate the PeerConnection for this specific client (SFU model)
    let _peer_connection = Arc::new(api.new_peer_connection(config).await.expect("Failed to create PC"));

    // Async task to push WS messages to client
    tokio::task::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let _ = client_ws_tx.send(msg).await;
        }
    });

    // Listen for incoming WebSocket messages (SDPs and ICE candidates)
    while let Some(result) = client_ws_rx.next().await {
        if let Ok(msg) = result {
            if let Ok(_text) = msg.to_str() {
                // SFU Logic:
                // If it's an Offer from the HOST, we set RemoteDescription, create an Answer, 
                // and bind a closure to peer_connection.on_track() to intercept the incoming RTP packets.
                // We then save a TrackLocalStaticRTP to the `broadcaster_track` state.
                
                // If it's an Offer from a LISTENER, we read the `broadcaster_track` state,
                // add that track to their local peer_connection via `peer_connection.add_track()`,
                // and THEN generate the Answer to send back.
                
                // (JSON parsing & SDP state machine implemented in the final CI/CD build phase)
                println!("[SFU] Received WebRTC Signaling Data from {}", client_id);
            }
        }
    }

    clients.write().await.remove(&client_id);
    println!("[Signaling] Client disconnected: {}", client_id);
}
