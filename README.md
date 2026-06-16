# Squirrel Sentry

A small browser app for monitoring a front door camera feed and flagging squirrel-like porch activity.

## Use it

Serve the folder locally:

```bash
python3 server.py
```

Then visit `http://localhost:4173`.

The local server is required for Home Assistant snapshot polling because it proxies the camera image so browser pixel analysis can read it.

## Camera hookup notes

- **Browser camera** works through `getUserMedia`, useful for testing with a laptop or USB camera.
- **Camera stream URL** accepts video sources the browser can play directly, such as HTTPS MP4 or Safari-compatible HLS `.m3u8`.
- **Home Assistant snapshot URL** accepts the camera entity picture URL, such as `/api/camera_proxy/camera.jarnex_lantern_camera?token=...`, expanded to `http://localhost:8123/...`.
- **RTSP door cameras** usually cannot be opened directly by a browser. Run an RTSP-to-HLS bridge such as `ffmpeg` or a camera/NVR feature that exposes HLS, then paste the HLS URL into the app.

## Detector behavior

The in-browser detector samples frames locally and combines motion, warm-brown color regions, and porch-level movement. It is intentionally privacy-preserving and dependency-free, but it is a heuristic rather than a trained wildlife model. For production-grade detection, this UI is ready to be connected to a server-side model such as YOLO/RT-DETR, Frigate, or a TensorFlow.js model.
