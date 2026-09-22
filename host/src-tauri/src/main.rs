use local_ip_address::local_ip;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tokio::net::TcpListener;
use futures_util::SinkExt;
use tokio_tungstenite::tungstenite::protocol::Message;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

#[derive(Serialize, Deserialize)]
struct NetworkInfo {
    ip: String,
    port: u16,
}

#[derive(Serialize, Deserialize, Clone)]
struct AudioDevice {
    id: String,
    name: String,
}

enum AudioCommand {
    Start(Option<String>),
    Stop,
}

struct AppState {
    tx: broadcast::Sender<Vec<u8>>,
    audio_tx: Mutex<std::sync::mpsc::Sender<AudioCommand>>,
    target_device: Mutex<Option<String>>,
    network_port: Mutex<u16>,
    jitter_delay: Mutex<u32>,
}

#[tauri::command]
fn get_network_info(state: tauri::State<'_, AppState>) -> Result<NetworkInfo, String> {
    let ip = local_ip()
        .map(|ip| ip.to_string())
        .map_err(|e| e.to_string())?;

    let port = *state.network_port.lock().unwrap();
    Ok(NetworkInfo { ip, port })
}

#[tauri::command]
fn get_audio_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    let devices = host.input_devices().map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for dev in devices {
        if let Ok(name) = dev.name() {
            result.push(AudioDevice {
                id: name.clone(),
                name,
            });
        }
    }
    
    Ok(result)
}

#[tauri::command]
fn set_target_device(device_id: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    *state.target_device.lock().unwrap() = Some(device_id);
    Ok(())
}

#[tauri::command]
fn set_jitter_delay(delay_ms: u32, state: tauri::State<'_, AppState>) -> Result<(), String> {
    *state.jitter_delay.lock().unwrap() = delay_ms;
    Ok(())
}

#[tauri::command]
fn set_network_port(port: u16, state: tauri::State<'_, AppState>) -> Result<(), String> {
    *state.network_port.lock().unwrap() = port;
    Ok(())
}

#[tauri::command]
fn engine_init(app_handle: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let port = *state.network_port.lock().unwrap();
    let tx_clone = state.tx.clone();
    
    tauri::async_runtime::spawn(async move {
        run_websocket_server(port, tx_clone, app_handle).await;
    });
    
    Ok(())
}

#[tauri::command]
fn start_stream(app_handle: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let target_device_name = state.target_device.lock().unwrap().clone();
    let audio_tx = state.audio_tx.lock().unwrap();
    
    audio_tx.send(AudioCommand::Start(target_device_name)).map_err(|e| e.to_string())?;
    app_handle.emit_all("engine_status", "streaming").unwrap_or_default();
    
    Ok(())
}

#[tauri::command]
fn stop_stream(app_handle: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let audio_tx = state.audio_tx.lock().unwrap();
    audio_tx.send(AudioCommand::Stop).map_err(|e| e.to_string())?;
    app_handle.emit_all("engine_status", "idle").unwrap_or_default();
    Ok(())
}

async fn run_websocket_server(port: u16, tx: broadcast::Sender<Vec<u8>>, app_handle: tauri::AppHandle) {
    if let Ok(listener) = TcpListener::bind(format!("0.0.0.0:{}", port)).await {
        println!("WebSocket server listening on port {}", port);

        while let Ok((stream, addr)) = listener.accept().await {
            let tx_clone = tx.clone();
            let app_handle_clone = app_handle.clone();
            
            tokio::spawn(async move {
                if let Ok(mut ws_stream) = tokio_tungstenite::accept_async(stream).await {
                    app_handle_clone.emit_all("node_connected", addr.ip().to_string()).unwrap_or_default();
                    
                    let mut rx = tx_clone.subscribe();
                    loop {
                        match rx.recv().await {
                            Ok(msg) => {
                                if ws_stream.send(Message::Binary(msg)).await.is_err() {
                                    break;
                                }
                            }
                            Err(broadcast::error::RecvError::Lagged(_)) => continue,
                            Err(broadcast::error::RecvError::Closed) => break,
                        }
                    }
                }
            });
        }
    }
}

fn build_audio_stream(target_device_name: Option<String>, tx: broadcast::Sender<Vec<u8>>) -> Result<cpal::Stream, String> {
    let host = cpal::default_host();
    
    let device = if let Some(name) = target_device_name {
        host.input_devices()
            .map_err(|e| e.to_string())?
            .find(|d| d.name().unwrap_or_default() == name)
            .ok_or("Specified device not found")?
    } else {
        host.default_input_device()
            .ok_or("Failed to get default input device")?
    };

    let config = device
        .default_input_config()
        .map_err(|e| e.to_string())?;
    
    let channels = config.channels();
    
    let mut encoder = opus::Encoder::new(
        48000, 
        if channels == 1 { opus::Channels::Mono } else { opus::Channels::Stereo }, 
        opus::Application::Audio
    ).map_err(|e| e.to_string())?;

    let err_fn = move |err| {
        eprintln!("An error occurred on stream: {}", err);
    };

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
    Ok(stream)
}

fn main() {
    let (tx, _rx) = broadcast::channel(1024);
    let (audio_tx, audio_rx) = std::sync::mpsc::channel::<AudioCommand>();
    
    let tx_clone = tx.clone();
    std::thread::spawn(move || {
        let mut current_stream: Option<cpal::Stream> = None;
        for cmd in audio_rx {
            match cmd {
                AudioCommand::Start(device_name) => {
                    match build_audio_stream(device_name, tx_clone.clone()) {
                        Ok(stream) => current_stream = Some(stream),
                        Err(e) => eprintln!("Failed to build stream: {}", e),
                    }
                }
                AudioCommand::Stop => {
                    current_stream = None;
                }
            }
        }
    });

    tauri::Builder::default()
        .manage(AppState {
            tx,
            audio_tx: Mutex::new(audio_tx),
            target_device: Mutex::new(None),
            network_port: Mutex::new(8080),
            jitter_delay: Mutex::new(500),
        })
        .invoke_handler(tauri::generate_handler![
            get_network_info,
            get_audio_devices,
            set_target_device,
            set_jitter_delay,
            set_network_port,
            engine_init,
            start_stream,
            stop_stream
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
