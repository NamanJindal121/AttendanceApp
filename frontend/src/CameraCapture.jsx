import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, Check, X } from "lucide-react";

// Full-screen camera modal: shows a LIVE front-camera preview, lets the user
// take the shot with a button, then confirm (Use) or retake before it's
// returned to the caller as a JPEG Blob. Replaces the old silent auto-capture.
//
//   onCapture(blob)  — called with the confirmed photo
//   onCancel()       — called if the user backs out
export default function CameraCapture({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [shot, setShot] = useState(null); // { blob, url } once captured
  const [error, setError] = useState("");

  // Start the camera on mount; stop it on unmount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        setError(
          "Could not access the camera. Check camera permissions and try again."
        );
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const takeShot = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) setShot({ blob, url: URL.createObjectURL(blob) });
      },
      "image/jpeg",
      0.85
    );
  };

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
  };

  const use = () => {
    stopStream();
    onCapture(shot.blob);
  };

  const cancel = () => {
    stopStream();
    if (shot) URL.revokeObjectURL(shot.url);
    onCancel();
  };

  return (
    <div className="cam-overlay">
      <div className="cam-modal">
        <div className="cam-stage">
          {/* Live preview (hidden once a shot is frozen) */}
          <video
            ref={videoRef}
            className="cam-video"
            playsInline
            muted
            style={{ display: shot ? "none" : "block" }}
          />
          {shot && <img className="cam-video" src={shot.url} alt="Your photo" />}
        </div>

        {error ? (
          <div className="cam-controls">
            <p className="error">{error}</p>
            <button onClick={cancel}>
              <X /> Close
            </button>
          </div>
        ) : shot ? (
          <div className="cam-controls">
            <button className="ghost" onClick={retake}>
              <RefreshCw /> Retake
            </button>
            <button onClick={use}>
              <Check /> Use photo
            </button>
          </div>
        ) : (
          <div className="cam-controls">
            <button className="ghost" onClick={cancel}>
              <X /> Cancel
            </button>
            <button onClick={takeShot}>
              <Camera /> Capture
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
