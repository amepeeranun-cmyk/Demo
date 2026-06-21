from __future__ import annotations

import io
import os
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from flask import Flask, jsonify, request, send_from_directory
from PIL import Image
from torchvision import models, transforms


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = Path(os.environ.get("MODEL_PATH", BASE_DIR / "best_model.pth"))
CLASS_NAMES = ["Calculus", "Caries", "Tooth Discoloration"]
THAI_LABELS = {
    "Calculus": "หินปูน",
    "Caries": "ฟันผุ",
    "Tooth Discoloration": "สีฟันผิดปกติ",
}

app = Flask(__name__, static_folder="static", static_url_path="")
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = None

transform_eval = transforms.Compose(
    [
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
)


class ModifiedEfficientNet(nn.Module):
    def __init__(self, num_classes: int):
        super().__init__()
        self.backbone = models.efficientnet_b0(weights=None)
        in_features = self.backbone.classifier[1].in_features
        self.backbone.classifier = nn.Identity()
        self.head = nn.Sequential(
            nn.Linear(in_features, 512),
            nn.BatchNorm1d(512),
            nn.ReLU(),
            nn.Dropout(0.4),
            nn.Linear(512, num_classes),
        )

    def forward(self, x):
        x = self.backbone(x)
        return self.head(x)


def load_model():
    global model
    if model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")
        loaded_model = ModifiedEfficientNet(num_classes=len(CLASS_NAMES)).to(device)
        loaded_model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
        loaded_model.eval()
        model = loaded_model
    return model


def predict_image(image_bytes: bytes) -> dict:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    input_tensor = transform_eval(image).unsqueeze(0).to(device)

    with torch.no_grad():
        outputs = load_model()(input_tensor)
        probs = F.softmax(outputs, dim=1).squeeze().cpu()

    best_idx = int(torch.argmax(probs).item())
    predicted_class = CLASS_NAMES[best_idx]
    confidence = float(probs[best_idx].item() * 100)
    probabilities = [
        {
            "className": class_name,
            "label": THAI_LABELS.get(class_name, class_name),
            "confidence": round(float(probs[idx].item() * 100), 2),
        }
        for idx, class_name in enumerate(CLASS_NAMES)
    ]
    probabilities.sort(key=lambda item: item["confidence"], reverse=True)

    return {
        "className": predicted_class,
        "label": THAI_LABELS.get(predicted_class, predicted_class),
        "confidence": round(confidence, 2),
        "probabilities": probabilities,
        "needsAttention": predicted_class in {"Calculus", "Caries"},
    }


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/health")
def health():
    return jsonify({"ok": True, "device": str(device), "modelExists": MODEL_PATH.exists()})


@app.post("/api/predict")
def predict():
    image_file = request.files.get("image")
    if image_file is None:
        return jsonify({"error": "กรุณาแนบรูปภาพช่องปากก่อนตรวจ"}), 400

    try:
        result = predict_image(image_file.read())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    return jsonify(result)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
