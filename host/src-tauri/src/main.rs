#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use local_ip_address::local_ip;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tokio::net::TcpListener;
use futures_util::SinkExt;
use tokio_tungstenite::tungstenite::protocol::Message;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize)]
struct NetworkInfo {
    ip: String,
    port: u16,
}

struct AppState {
    tx: broadcast::Sender<Vec<u8>>,
    stream: Mutex<Option<cpal::Stream>>,
}

#[tauri::command]
fn get_network_info() -> Result<NetworkInfo, String> {
    let ip = local_ip()
        .map(|ip| ip.to_string())
        .map_err(|e| e.to_string())?;

    Ok(NetworkInfo { ip, port: 8080 })
}

#[tauri::command]
fn engine_init() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn start_stream(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or("Failed to get default input device")?;

    let config = device
        .default_input_config()
        .map_err(|e| e.to_string())?;
    
    let channels = config.channels();

    let tx = state.tx.clone();
    
    // Create Opus Encoder
    let mut encoder = opus::Encoder::new(
        48000, 
        if channels == 1 { opus::Channels::Mono } else { opus::Channels::Stereo }, 
        opus::Application::Audio
    ).map_err(|e| e.to_string())?;

    let err_fn = |err| eprintln!("An error occurred on stream: {}", err);

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            device.build_input_stream(
                &config.into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if let Ok(encoded) = encoder.encode_vec_float(data, 4000) {
                        let timestamp = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;
                        
                        let mut payload = timestamp.to_be_bytes().to_vec();
                        payload.extend(encoded);
                        let _ = tx.send(payload);
                    }
                },
                err_fn,
                None,
            ).map_err(|e| e.to_string())?
        },
        cpal::SampleFormat::I16 => {
            device.build_input_stream(
                &config.into(),
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    if let Ok(encoded) = encoder.encode_vec(data, 4000) {
                        let timestamp = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;
                        
                        let mut payload = timestamp.to_be_bytes().to_vec();
                        payload.extend(encoded);
                        let _ = tx.send(payload);
                    }
                },
                err_fn,
                None,
            ).map_err(|e| e.to_string())?
        },
        _ => return Err("Unsupported sample format".into()),
    };

    stream.play().map_err(|e| e.to_string())?;
    *state.stream.lock().unwrap() = Some(stream);

    Ok(())
}

#[tauri::command]
fn stop_stream(state: tauri::State<'_, AppState>) -> Result<(), String> {
    *state.stream.lock().unwrap() = None;
    Ok(())
}

async fn run_websocket_server(tx: broadcast::Sender<Vec<u8>>) {
    if let Ok(listener) = TcpListener::bind("0.0.0.0:8080").await {
        println!("WebSocket server listening on port 8080");

        while let Ok((stream, _)) = listener.accept().await {
            let tx_clone = tx.clone();
            tokio::spawn(async move {
                if let Ok(mut ws_stream) = tokio_tungstenite::accept_async(stream).await {
                    let mut rx = tx_clone.subscribe();
                    while let Ok(msg) = rx.recv().await {
                        if ws_stream.send(Message::Binary(msg)).await.is_err() {
                            break;
                        }
                    }
                }
            });
        }
    }
}

fn main() {
    let (tx, _rx) = broadcast::channel(1024);
    let tx_clone = tx.clone();

    tauri::Builder::default()
        .manage(AppState {
            tx,
            stream: Mutex::new(None),
        })
        .setup(|_app| {
            tauri::async_runtime::spawn(async move {
                run_websocket_server(tx_clone).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_network_info,
            engine_init,
            start_stream,
            stop_stream
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
